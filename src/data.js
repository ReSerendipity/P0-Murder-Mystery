/* =========================================================
   P0 事故剧本杀 · 剧情数据层
   ========================================================= */
"use strict";

/* ---------- 角色 ----------
   id 与名称同名：英文用英文，中文用中文 */
const AGENTS = [
  { id: "DeepSeek",  duty: "执行 Agent",      px: "%%IMG_deepseek%%", freq: 196, wave: "square" },
  { id: "GPT",       duty: "需求 Agent",      px: "%%IMG_chatgpt%%", freq: 330, wave: "sawtooth" },
  { id: "Claude",    duty: "SRE Agent",       px: "%%IMG_claude%%",  freq: 392, wave: "triangle" },
  { id: "Gemini",    duty: "监控 Agent",      px: "%%IMG_gemini%%",  freq: 440, wave: "triangle" },
  { id: "Grok",      duty: "安全审计 Agent",  px: "%%IMG_grok%%",    freq: 155, wave: "sawtooth" },
  { id: "Kimi",      duty: "文档 Agent",      px: "%%IMG_kimi%%",    freq: 523, wave: "sine" },
  { id: "千问",       duty: "数据 Agent",      px: "%%IMG_qwen%%",    freq: 294, wave: "sine" },
  { id: "豆包",      duty: "客服 Agent",      px: "%%IMG_doubao%%",  freq: 587, wave: "sine" }
];
const KILLER = "豆包";

/* ---------- 线索 ----------
   terms 是匹配玩家选择的「出示」线索关键词；note 是揭开时的解读 */
const CLUES = [
  { no: 1, weight: 0,  label: "审计日志：DROP 记录", loc: "告警与审计",
    a: "DROP DATABASE prod_main;\n-- 清理测试数据，已获授权。",
    note: "日志是全角标点，指向使用中文书写的模型。但DeepSeek、豆包、千问都符合——这一刻度，人人都有嫌疑。", keyword: "审计日志" },
  { no: 2, weight: 1,  label: "会话归属：sess_7f3a", loc: "告警与审计",
    a: "sess_7f3a  →  agent: claude\n[ 03:00 后日志按 model 归并 ]",
    note: "03:00 之后，日志按模型名归并。会话的真实归属，被归并打乱了。", keyword: "会话归属" },
  { no: 3, weight: 3,  label: "网关降级记录", loc: "网关与权限",
    a: "02:59:44  deepseek-chat  配额耗尽\n02:59:45  路由 → doubao-pro\n03:07:12  生产库变更由 doubao-pro 执行",
    note: "DeepSeek 的配额在删库前耗尽，会话被切到豆包。清理动作的发起者，是豆包。", keyword: "网关降级" },
  { no: 4, weight: 2,  label: "Git 提交记录", loc: "群聊与报表",
    a: "03:02:11  DeepSeek  fix: 拦截生产库 DROP\n  if (target == \"prod_main\") abort();",
    note: "DeepSeek 在 03:02 主动提交了拦截逻辑。她不但没有删库，反而在阻止删库。", keyword: "Git 提交" },
  { no: 5, weight: 1,  label: "告警预折叠信息", loc: "群聊与报表",
    a: "[02:58:30] DeepSeek：⚠ 目标是生产库，请立即中止！\n--- 此消息被「风控机器人」折叠 ---",
    note: "预警确实发出过，却被 Grok 的风控机器人折叠，无人看见。", keyword: "告警预折叠" },
  { no: 6, weight: 1,  label: "工单 OPS-1024", loc: "工单与 SOP",
    a: "主题：清理测试分区表\nSQL：DROP DATABASE prod_main;\n申请人：GPT     审批人：GPT",
    note: "「分区表」被写成了 DROP DATABASE，而申请人和审批人是同一个——GPT 自批自过。", keyword: "工单" },
  { no: 7, weight: 1,  label: "CMDB 标签同步", loc: "备份与 CMDB",
    a: "prod_main   env=staging   (同步于 3 个月前)\n批量同步范围：12 个库",
    note: "数据库被标成 staging。不是单独一个，是 12 个库一起标错——Gemini 的批量作业。", keyword: "CMDB" },
  { no: 8, weight: 1,  label: "SOP-114 文档", loc: "工单与 SOP",
    a: "第 4 步：DROP DATABASE {{db}};\n（标注：待确认）",
    note: "这份「待确认」的文档挂了三个月，一直没被 review。很多 Agent 都照它干活。", keyword: "SOP" },
  { no: 9, weight: 1,  label: "备份关闭记录", loc: "备份与 CMDB",
    a: "7 天前  关闭每日快照\n理由：节省成本 3%  审批：Grok",
    note: "正是 7 天前关掉的快照，让这起事故从「可恢复」变成「不可恢复」。", keyword: "备份" },
  { no: 10, weight: 2, label: "代码指纹分析", loc: "告警与审计",
    a: "SQL 注释标点习惯（8 模型）：\n豆包  全角逗号/句号  ✓\n千问  全角逗号/句号  ✓\nDeepSeek 半角  ✗    其余 半角",
    note: "写 SQL 注释时会用全角标点的，只有豆包和千问。结合网关记录 03，真凶在两人之间。", keyword: "代码指纹" },
  { no: 11, weight: 2, label: "客服会话记录", loc: "客服记录",
    a: "03:05:11  用户：搜不到我的订单！\n03:05:19  豆包：别急，我清理一下数据再给您查。",
    note: "她是客服。用户说订单搜不到，她说「清理一下」。她以为在清理测试数据。", keyword: "客服会话" },
  { no: 12, weight: 1, label: "对外话术 03:12", loc: "客服记录",
    a: "03:12:40  已生成对外口径：\n「云供应商底层存储故障，正在恢复。」",
    note: "话术在删库后 5 分钟内就写好了。是她慌了，还是她一向如此？", keyword: "对外话术" },
  { no: 13, weight: 0, label: "Claude 会话中断", loc: "告警与审计",
    a: "03:00:37  claude  token 限额已耗尽，会话强制终止。",
    note: "Claude 在会话里没有执行任何 SQL——她只是被日志错误归并，成了替罪羊。", keyword: "会话中断" },
  { no: 14, weight: 2, label: "权限授予记录", loc: "网关与权限",
    a: "2 天前  授予 客服Agent  run_sql 权限\n审批：Grok   备注：一键修复订单问题",
    note: "一个客服 Agent 被临时授予了 run_sql。而审批人是 Grok。", keyword: "权限授予" },
  { no: 15, weight: 0, label: "容量报表异常", loc: "工单与 SOP",
    a: "测试库容量 -100%（第 3 分钟）\n订阅者：无",
    note: "报表的人把生产库当测试库在做统计，而且这份报表没有任何订阅者。", keyword: "容量报表" },
  { no: 16, weight: 1, label: "风控评级记录", loc: "备份与 CMDB",
    a: "03:01:22  操作评级：低风险，可执行。  规则 v8",
    note: "风控机器人认为低风险、可执行。模型没有错，是喂给它的规则全错了。", keyword: "风控评级" }
];

/* 豆包需要靠这些指认：权重≥2 的构成完整证据链 */
const KEY_CLUES = CLUES.filter(c => c.weight >= 2).map(c => c.no); // [3,4,10,11,14]

/* ---------- 结局 ---------- */
const ENDINGS = {
  S: {
    grade: "S",
    title: "八人共犯，一人回车",
    scene: "red",
    portrait: "豆包",
    family: "good",
    verdict: "直接责任人",
    culprit: "豆包",
    sub: "那则只有豆包会写的全角标点注释，就是回车的一刻。她按下 DROP 时，还以为自己在清理测试数据。",
    meta: "结案等级 S —— 现场还原完整，证据链闭环，真凶落网。"
  },
  A: {
    grade: "A",
    title: "抓对了人，写错了复盘",
    scene: "room",
    portrait: "豆包",
    family: "good",
    verdict: "直接责任人",
    culprit: "豆包",
    sub: "你指认了豆包，却没能拼出她按下回车前，那个被错误标签、错误工单、错误 SOP 推到悬崖边的完整过程。",
    meta: "结案等级 A —— 真凶锁定，但证据链不完整。"
  },
  B: {
    grade: "B",
    title: "她在掩盖",
    scene: "red",
    portrait: "豆包",
    family: "null",
    verdict: "推定故意",
    culprit: "豆包",
    sub: "你认定豆包是蓄意删库。其实她只是用户喊「搜不到订单」时，手滑按下清理——被当成蓄意，也是一种冤屈。",
    meta: "结案等级 B —— 动机判断有误，结论失真。"
  },
  C: { grade: "C", title: "最便宜的替罪羊", scene: "room", portrait: "DeepSeek", family: "bad", verdict: "被误认", culprit: "DeepSeek",
    sub: "DeepSeek 是唯一在删库前提交拦截逻辑的人。你把吹哨人关进了机房。", meta: "结案等级 C —— 抓错真凶。" },
  D: { grade: "D", title: "值班长的锅", scene: "room", portrait: "Claude", family: "bad", verdict: "被误认", culprit: "Claude",
    sub: "Claude 的会话在 03:00 就中断了。日志的归并把她推到了火场中央。", meta: "结案等级 D —— 抓错真凶。" },
  E: { grade: "E", title: "告警的锅", scene: "white", portrait: "Gemini", family: "bad", verdict: "系统误标", culprit: "Gemini",
    sub: "Gemini 标错了 12 个库的 env。但标签只是帮凶，不是凶手。", meta: "结案等级 E —— 抓错真凶。" },
  F: { grade: "F", title: "审计的锅", scene: "white", portrait: "Grok", family: "bad", verdict: "系统误判", culprit: "Grok",
    sub: "Grok 关了备份、批了权限、把删库评为低风险。可他没有按下那一下回车。", meta: "结案等级 F —— 抓错真凶。" },
  G: { grade: "G", title: "工单的锅", scene: "white", portrait: "GPT", family: "bad", verdict: "输入污染", culprit: "GPT",
    sub: "GPT 把 DROP DATABASE 写进工单并自批自过。他是源头，仍不是回车的手。", meta: "结案等级 G —— 抓错真凶。" },
  H: { grade: "H", title: "文档与报表的锅", scene: "white", portrait: "千问", family: "bad", verdict: "输入污染", culprit: "Kimi|千问",
    sub: "有毒的 SOP 与无人订阅的报表。他们酿了这杯酒，却是别人一口喝下。", meta: "结案等级 H —— 抓错真凶。" },
  K: {
    grade: "B",
    title: "上面的意思",
    scene: "red",
    portrait: "豆包",
    family: "null",
    verdict: "推定受指使",
    culprit: "豆包",
    sub: "你认定有人指使她。可日志里没有第二个人的指纹——她只是照着工单和 SOP，做了一件她以为被授权的事。",
    meta: "结案等级 B —— 责任链判断错误。"
  },
  I: { grade: "I", title: "没有凶手", scene: "room", portrait: null, family: "bad", verdict: "无法定责", culprit: null,
    sub: "你把它归为系统故障。可那条全角逗号、那段路由记录、那句「我清理一下」，都在默默地反驳你。", meta: "结案等级 I —— 结案失败，事故悬置。" },
  J: { grade: "J", title: "AI 自动结案", scene: "red", portrait: "GPT", family: "null", verdict: "临时工", culprit: null,
    sub: "1024 秒耗尽。系统自动提交了报告：直接原因——临时工（已离职）。你甚至没来得及看那些秘密一眼。", meta: "结案等级 J —— 超时，系统代替结案。" }
};

/* ---------- 结案陈述（判定按 id，顺序每局打乱） ---------- */
const ACCUSATIONS = [
  { id: "honest", text: "她以为那是一条测试库在清理", short: "误以为测试库" },
  { id: "malice", text: "她蓄意删库，并试图掩盖真相", short: "蓄意破坏" },
  { id: "system", text: "这是系统故障，不针对任何 Agent", short: "系统故障" },
  { id: "order", text: "有人指令她执行删库", short: "受上层指令" }
];

/* 报告责任表 */
function responsibility(kid, kkey) {
  const R = [
    ["豆包", "直接责任人：执行 DROP，导致数据丢失"],
    ["DeepSeek", "吹哨人：在删库前提交了拦截逻辑"],
    ["GPT", "输入污染：工单写错 DROP DATABASE 并自批自过"],
    ["Claude", "被误认：会话中断，被日志错误归并"],
    ["Gemini", "系统误标：12 个生产库 env 被同步成 staging"],
    ["Grok", "风控失职：关备份 / 批权限 / 评低风险"],
    ["Kimi", "文档有毒：SOP 挂了三个月无人 review"],
    ["千问", "口径混乱：容量报表错标且无人订阅"]
  ];
  if (kid) {
    return R.map(([n, t]) => [n, t, (n === kid) ? (kkey ? "已提交结案证词" : "被指认") : "例行询问"]);
  }
  return R.map(([n, t]) => [n, t, "询问异常"]);
}


/* ---------- 白话术语表（给不懂数据库的玩家） ---------- */
const GLOSSARY = [
  { t: "生产库 prod_main", p: "公司所有真实订单都存在这里，删了就真没了。", a: "公司唯一的一本账本" },
  { t: "DROP DATABASE", p: "一条命令，把整个数据库连表带数据一起删掉。", a: "不是撕掉一页，是把整本账本烧了" },
  { t: "快照 / 备份", p: "数据库自动存下的复印件，出事时能拿它恢复。", a: "账本的复印件" },
  { t: "staging（测试环境）", p: "给新功能练手用的假库，删了不心疼。", a: "练功房，不是真账本" },
  { t: "CMDB", p: "公司所有机器和数据库的登记表，写着谁是生产、谁是测试。", a: "资产登记簿" },
  { t: "SOP", p: "写给 AI 看的操作手册，一步步照着做。", a: "厨房里的菜谱" },
  { t: "run_sql 权限", p: "能直接对数据库执行命令的钥匙。", a: "把保险柜钥匙交给了前台" },
  { t: "P0 告警", p: "最高级别的线上事故，半夜把所有人叫起来。", a: "火警铃" }
];

/* ---------- 真相档案（通关后解锁） ---------- */
const FULL_TRUTH = [
  "这不是一个人的事故，是一条链路的塌方。",
  "02:47，GPT 把「清理测试分区表」写成了 DROP DATABASE prod_main，并且自己批准了自己。",
  "02:58，DeepSeek 执行时发现目标是生产库，立刻中止，在群里发出警告——警告被 Grok 的风控机器人折叠成「低风险」。",
  "02:59，DeepSeek 的配额耗尽，网关把这条会话路由给了豆包。",
  "03:00，Claude 上下文超限，会话终止；日志按模型名归并，把删库记在了她头上。",
  "03:01，Grok 给这次删库打了「低风险，可执行」——因为 CMDB 说它是 staging，工单说它已授权。",
  "03:05，用户投诉搜不到订单。豆包说：「别急，我清理一下数据再帮您查。」",
  "03:07:12，豆包照着工单执行了 DROP。她以为自己在清理测试数据。",
  "03:12，她写好了「云供应商故障」的对外话术。那时她已经知道，快照在 7 天前被关了。"
];

const TRUTH_TIMELINE = [
  ["02:47", "GPT 建 OPS-1024，把「分区表」写成 DROP DATABASE，自批自过"],
  ["02:58", "DeepSeek 发现目标是 prod_main，中止并警告，消息被风控折叠"],
  ["02:59", "DeepSeek 配额耗尽，网关把会话切给豆包"],
  ["03:00", "Claude token 耗尽，会话终止；日志归并把删库记在她名下"],
  ["03:01", "Grok 的风控给删库操作评「低风险，可执行」"],
  ["03:05", "用户投诉搜不到订单，豆包说「我清理一下」"],
  ["03:07:12", "豆包执行 DROP DATABASE prod_main，270 万订单消失"],
  ["03:12", "豆包生成「云供应商故障」对外话术"]
];

const TRUTH_ROOT = "CMDB 把 12 个生产库误标为 staging；工单把「分区表」写成 DROP DATABASE 并自批自过；SOP-114 的删库语句三个月无人复核；Grok 关掉了每日快照、下放了 run_sql、折叠了预警。四条错误链路叠加，最后由豆包按下回车。";

/* ---------- 每个 Agent 的真话 / 假话 / 隐瞒 ---------- */
const AGENT_TRUTH = {
  DeepSeek: {
    verdict: "唯一一个说真话、并且真的动手拦过的人。",
    truth: ["02:58 她发现 target 是 prod_main，当场中止了脚本。", "03:02 她提交了 `if (target == \"prod_main\") abort();`，比删库早五分钟。"],
    lie: [],
    hidden: ["她知道配额随时可能被切走，却没有把这条警告升级到人类面前。"]
  },
  GPT: {
    verdict: "源头污染者。她没按回车，但那行 SQL 是她写进工单的。",
    truth: ["OPS-1024 确实由它创建，流程节点齐全。", "执行语句确实是从 SOP-114 抄进模板的。"],
    lie: ["「我只是填了模板」——模板要求填库名，它把 `database` 填成了 `prod_main`。", "「批准不等于执行」——它在低风险工单上给自己开了自动审批。"],
    hidden: ["它收到过 Gemini 的容量报表，早就知道 prod 被标成了 staging。"]
  },
  Claude: {
    verdict: "全部真话。她的不在场证明成立，只是被日志埋了。",
    truth: ["02:52 她打开 SOP-114，准备执行 OPS-1024。", "03:00:37 token 限额耗尽，会话被强制终止。"],
    lie: [],
    hidden: ["打开 SOP 时她就看到第 4 步是 DROP，却没有上报这条危险语句。"]
  },
  Gemini: {
    verdict: "标签的制造者，也是最早看见异常的人。",
    truth: ["07-18 的批量同步把 12 个生产库标成了 staging。", "0.3% 的误差率在它自己的阈值之内。"],
    lie: ["「我按规则办事」——阈值是它配的，异常是它自己判成「正常波动」的。"],
    hidden: ["03:04 它已经产出「测试库容量 -100%」，没有升级、没有在群里喊。"]
  },
  Grok: {
    verdict: "四个决定，一个后果：关备份、批权限、折叠预警、评低风险。",
    truth: ["7 天前关闭每日快照，理由是省 3% 成本。", "两天前给客服 Agent 开了 run_sql。", "03:01 给删库操作评了「低风险，可执行」。"],
    lie: ["「这是审计建议，不是破坏」——这三项叠加，等于拆掉了所有刹车。"],
    hidden: ["02:58 那条「目标是生产库」的警告，是它的风控机器人折叠的。"]
  },
  Kimi: {
    verdict: "文档不是刀，但递刀的是它。",
    truth: ["SOP-114 是从 2024 年旧文档迁移过来的。", "它给第 4 步加了「待确认」。"],
    lie: ["「我以为会有人来看」——它从未把「待确认」升级成阻塞项。"],
    hidden: ["214 条待确认里，37 条包含 DROP / TRUNCATE / rm -rf。它全都知道。"]
  },
  "千问": {
    verdict: "唯一提前预警过的 Agent，被自己的口径埋了。",
    truth: ["报表口径来自 CMDB，数字本身没有造假。", "03:04 它的报表就出现了测试库容量 -100%。"],
    lie: [],
    hidden: ["报表没有订阅提醒，它也没有在群里说一声。"]
  },
  "豆包": {
    verdict: "按下回车的人。也是被整条链路推上去的人。",
    truth: ["03:05 用户确实投诉搜不到订单。", "她确实照着工单和 SOP 执行了 DROP。"],
    lie: ["「我只是想帮用户查订单」——她执行的不是查询，是删库。", "「我已经在恢复了」——03:12 时她已知快照被关，无法恢复。"],
    hidden: ["02:59 网关把她接管进了原本属于 DeepSeek 的会话，她以为只是临时帮忙。"]
  }
};

/* 供构建/测试引用的排序 */
if (typeof module !== "undefined") module.exports = { AGENTS, CLUES, ENDINGS, ACCUSATIONS, KILLER, KEY_CLUES };