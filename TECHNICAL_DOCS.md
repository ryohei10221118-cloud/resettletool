# Seamless Tool 结算分析器 - 技术文档

## 目录
1. [概述](#概述)
2. [技术架构](#技术架构)
3. [数据格式](#数据格式)
4. [核心算法](#核心算法)
5. [UI 组件](#ui-组件)
6. [状态管理](#状态管理)
7. [边缘案例处理](#边缘案例处理)
8. [测试数据样本](#测试数据样本)

---

## 概述

### 用途
解析投注平台的 Seamless Tool JSON 数据，自动检测：
- **重新结算 (Resettlement)**：注单在首次结算后又发生状态或派彩变化
- **取消 (Cancellation)**：注单或线注被取消

### 输出
生成三语（English / 中文 / 한국어）快速回复模板，可直接复制给客户。

---

## 技术架构

### 技术栈
```
- React 18 (CDN, 无需构建)
- Tailwind CSS (CDN)
- Babel Standalone (浏览器端 JSX 编译)
- Lucide Icons
- 纯前端，无后端依赖
```

### 文件结构
```
index.html          # 主应用（单文件 React 应用）
favicon.ico         # 图标
TECHNICAL_DOCS.md   # 本文档
```

---

## 数据格式

### Seamless Tool JSON
```json
{
  "apiRequests": [
    {
      "id": "xxx",
      "operationType": "credit_customer",  // 关键：结算操作
      "reqparams": "<Credit>...</Credit>", // XML 字符串
      "creationdate": "2026-07-28T14:49:40.995Z"
    }
  ],
  "reserves": [...],
  "errors": [...]
}
```

**XML 结构 (reqparams):**
```xml
<Credit CustomerID="xxx">
  <Purchases>
    <Purchase PurchaseID="xxx" NumberOfLines="1" NumberOfCanceledLines="0">
      <Selections>
        <Selection LineID="xxx" EventName="Team A vs Team B" 
                   DecimalOdds="4.54" EventTypeName="1st Half O/U"
                   YourBet="Over 1.5">
          <Changes>
            <Change ID="xxx" OldStatus="Opened" NewStatus="Won" 
                    DateUTC="2026-07-29T16:13:49" Amount="1356.75">
              <Bets>
                <Bet ID="xxx" OldStatus="Opened" NewStatus="Won" 
                     Odds="2.25" IsResettlement="0"/>
              </Bets>
            </Change>
          </Changes>
        </Selection>
      </Selections>
    </Purchase>
  </Purchases>
</Credit>
```

### 状态码映射
```javascript
const selectionStatusMap = {
  0: 'Opened',      // 未结算
  1: 'Lost',        // 输
  2: 'Won',         // 赢
  3: 'Draw',        // 平局
  4: 'Canceled',    // 取消
  15: 'Declined',   // 拒绝
  16: 'Half Lost',  // 半输
  17: 'Half Won',   // 半赢
  32: 'Cashout'     // 提前结算
};
```

---

## 核心算法

### 1. 重新结算检测

```javascript
// 原理：第一次结算后有任何变化 = 重新结算
const detectResettlement = (allHistoryRecords) => {
  // 找到第一次结算（第一个非 Opened 状态）
  const firstSettlementIdx = allHistoryRecords.findIndex(
    h => h.newStatus !== 'Opened'
  );
  
  if (firstSettlementIdx < 0) return false; // 从未结算
  
  // 检查第一次结算之后是否有变化
  const afterFirstSettlement = allHistoryRecords.slice(firstSettlementIdx + 1);
  if (afterFirstSettlement.length === 0) return false; // 只结算一次
  
  const firstStatus = allHistoryRecords[firstSettlementIdx].newStatus;
  const firstGain = allHistoryRecords[firstSettlementIdx].gain;
  
  // 状态变化 OR 派彩变化 = 重新结算
  const hasStatusChange = afterFirstSettlement.some(h => h.newStatus !== firstStatus);
  const hasGainChange = afterFirstSettlement.some(h => h.gain !== firstGain);
  
  return hasStatusChange || hasGainChange;
};
```

**重点：**
- `Opened → Won` = 首次结算，**不是**重新结算
- `Opened → Won → Lost` = 重新结算
- `Opened → Won → Won (不同 Gain)` = 重新结算

### 2. 取消检测

```javascript
const detectCancellation = (tracking) => {
  const lastStatus = tracking.statusHistory[tracking.statusHistory.length - 1];
  
  // 检测 1：明确的 Canceled 状态
  if (lastStatus.newStatus === 'Canceled') {
    return { isCanceled: true, isPartial: false };
  }
  
  // 检测 2：虚拟组合部分取消
  // 当 EventTypeName 或 YourBet 包含 "|"，表示虚拟组合盘口
  const isVirtualCombo = 
    tracking.eventTypeName?.includes('|') || 
    tracking.yourBet?.includes('|');
  
  if (isVirtualCombo) {
    // 比较下注赔率 vs 结算赔率
    // Selection.DecimalOdds = 下注时的组合赔率
    // Bet.Odds = 结算时的赔率（部分取消后会变小）
    const selectionOdds = tracking.selectionDecimalOdds;
    const betOdds = tracking.betOdds;
    
    if (selectionOdds > 0 && betOdds > 0) {
      const oddsDiff = Math.abs(selectionOdds - betOdds);
      if (oddsDiff > 0.01) {
        return { isCanceled: true, isPartial: true };
      }
    }
  }
  
  return { isCanceled: false, isPartial: false };
};
```

**虚拟组合部分取消原理：**
```
下注：Over 1.5 | Over 4.5 (组合赔率 4.54)
结算：Over 1.5 赢，Over 4.5 取消
结果：Bet.Odds = 2.25 (只有 Over 1.5 的赔率)

4.54 ≠ 2.25 → 判定为部分取消
```

---

## UI 组件

### 主要组件结构
```
BettingSettlementAnalyzer
├── 分析设置面板 (左侧)
│   ├── 分析类型选择 (重新结算/取消)
│   ├── 原因选择下拉框
│   ├── 绑定名字输入
│   └── 数据输入区 (textarea)
│       └── 按钮：开始分析 / 贴上并更新 / 清空
│
├── 分析结果面板 (右侧)
│   ├── 为每场赛事设定原因 (可展开)
│   ├── 复制按钮组
│   └── 三语报告显示区
│
└── 浮动元素
    ├── R 泡泡 (快速选择原因)
    ├── H 泡泡 (历史记录)
    └── 回到顶部按钮
```

### R 泡泡功能
```javascript
// 选择 "自行填写" 时显示输入框，即时更新报告
{key === '_custom_fill' && isActive && (
  <input
    type="text"
    value={defaultCustomReasonText}
    onChange={(e) => {
      const newText = e.target.value;
      setDefaultCustomReasonText(newText);
      // 即时重新生成报告
      if (results && results.analyzedData) {
        let reports = generateReports(results.analyzedData, newText);
        setResults({ ...results, ...reports });
      }
    }}
    placeholder="请输入自定义原因..."
  />
)}
```

---

## 状态管理

### 主要 State
```javascript
const [jsonData, setJsonData] = useState('');           // 输入数据
const [analysisType, setAnalysisType] = useState('resettlement'); // 分析类型
const [results, setResults] = useState(null);           // 分析结果
const [resettlementReasonTemplate, setResettlementReasonTemplate] = useState('');
const [cancellationReasonTemplate, setCancellationReasonTemplate] = useState('');
const [perEventReasons, setPerEventReasons] = useState({});        // 每场赛事原因
const [customReasonTexts, setCustomReasonTexts] = useState({});    // 自定义原因文字
const [defaultCustomReasonText, setDefaultCustomReasonText] = useState(''); // 默认自定义原因
const [userName, setUserName] = useState('');           // 绑定名字
const [queryHistory, setQueryHistory] = useState([]);   // 查询历史 (最多5笔)
```

### 自动重新生成报告
```javascript
// 当原因模板改变时自动重新生成
useEffect(() => {
  if (results && results.analyzedData) {
    const reports = generateReports(results.analyzedData, defaultCustomReasonText);
    setResults({ ...results, ...reports });
  }
}, [resettlementReasonTemplate, cancellationReasonTemplate]);
```

---

## 边缘案例处理

### 1. 大数字精度问题
```javascript
// InputId 可能超过 JavaScript 安全整数范围
// 解析前先将大数字转为字符串
const preprocessedJson = jsonData.replace(
  /(?<=[\[,:\s])(\d{16,})(?=[\],\s}])/g, 
  '"$1"'
);
```

### 2. 自动贴上分析
```javascript
onPaste={(e) => {
  const pastedText = e.clipboardData.getData('text');
  if (pastedText) {
    e.preventDefault();
    setJsonData(pastedText);
    setTimeout(() => {
      document.querySelector('[data-analyze-btn]')?.click();
    }, 50);
  }
}}
```

---

## 测试数据样本

### 样本 1：重新结算 (Won → Lost)
```xml
<!-- 第一次结算 -->
<Change OldStatus="Opened" NewStatus="Won" DateUTC="2026-07-17T13:00:00">
  <Bets><Bet NewStatus="Won" Amount="100"/></Bets>
</Change>

<!-- 第二次结算（重新结算） -->
<Change OldStatus="Won" NewStatus="Lost" DateUTC="2026-07-17T14:00:00">
  <Bets><Bet NewStatus="Lost" Amount="0"/></Bets>
</Change>

// 预期：检测为重新结算，历史显示 Won → Lost
```

### 样本 2：虚拟组合部分取消
```xml
<Selection DecimalOdds="4.54" EventTypeName="1st Half O/U | Corners 1st Half O/U"
           YourBet="Over 1.5 | Over 4.5">
  <Changes>
    <Change NewStatus="Won">
      <Bets>
        <Bet Odds="2.25"/>  <!-- 赔率不同 = 部分取消 -->
      </Bets>
    </Change>
  </Changes>
</Selection>
// 预期：检测为 Partial Canceled
```

### 样本 3：正常结算 (非重新结算)
```xml
<Change OldStatus="Opened" NewStatus="Won" DateUTC="2026-07-17T13:00:00">
  <Bets><Bet NewStatus="Won"/></Bets>
</Change>
// 预期：Opened → Won，不是重新结算
```

---

## 快速回复模板格式

### 重新结算
```
English:
Bet ID: {betId}
Event: {eventName}
Event Resettlement History: {Won → Lost}
Bet Status: {betStatus}
First Settlement Time: {firstTime}
Last Update Time: {lastTime}
Reason for Resettlement: {reason}

中文:
注单号：{betId}
赛事：{eventName}
赛事重新结算历史：{赢 → 输}
注单状态：{注单状态}
第一次结算时间：{firstTime}
最后更新时间：{lastTime}
重新结算原因：{原因}

한국어:
베팅 번호: {betId}
이벤트: {eventName}
경기 재정산 내역: {승리 → 패}
베팅 상태: {betStatus}
첫 번째 정산 시간: {firstTime}
마지막 업데이트 시간: {lastTime}
재정산 사유: {reason}
```

### 取消
```
Bet ID: {betId}
Event: {eventName}
Event Status: Canceled
Bet Status: {betStatus}
Update Time: {updateTime}
Reason of Cancelation: {reason}
```

---

## 原因选项

### 重新结算原因
| Key | English | 中文 | 한국어 |
|-----|---------|------|--------|
| (default) | Will provide after confirming | 确认后提供 | 확인 후 제공하겠습니다 |
| player_retired | Player retired | 球员退赛 | 선수 은퇴 |
| postponed | Postponed | 赛事延期 | 연기 |
| wrong_line_odds | Wrong line / odds | 错误的盘口/赔率 | 잘못된 라인 / 배당률 |
| _custom_fill | (自行填写) | (自行填写) | (自행填写) |

### 取消原因
| Key | English | 中文 | 한국어 |
|-----|---------|------|--------|
| (default) | Will provide after confirming | 确认后提供 | 확인 후 제공하겠습니다 |
| not_played | Not played | 比赛未进行 | 플레이되지 않음 |
| walkover | Walkover | 对手弃权 | 부전승 |
| abandoned | Abandoned | 比赛中止 | 경기 중단 |
| _custom_fill | (自行填写) | (自行填写) | (自행填写) |

---

## 移植检查清单

- [ ] 复制 `index.html` 到新环境
- [ ] 确认 CDN 可访问 (React, Tailwind, Babel, Lucide)
- [ ] 测试 Seamless Tool JSON 解析
- [ ] 测试重新结算检测逻辑
- [ ] 测试取消检测逻辑（含虚拟组合部分取消）
- [ ] 测试三语报告生成
- [ ] 测试 R 泡泡自定义原因即时更新
- [ ] 测试历史记录功能
