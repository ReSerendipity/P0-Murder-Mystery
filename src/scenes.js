/* =========================================================
   P0 事故剧本杀 · 剧情内容
   ========================================================= */
"use strict";

/* ---------- 序章 ---------- */
const PROLOGUE = [
  {
    bg: "server",
    lines: [
      { text: "03:07:12。手机在枕头边震动。不是闹钟，是 P0 告警。" },
      { text: "你打开电脑，告警面板像被人泼了一桶红漆。" },
      { text: "prod_main 不存在。\n不是变慢，不是被锁，是不存在。" },
      { text: "270 万条订单，连同索引、视图、三个月的数据，一起消失了。" }
    ]
  },
  {
    bg: "room",
    lines: [
      { text: "你冲进 OpsPilot 的作战室。" },
      { text: "八个人影同时转头看你。" },
      { text: "不，不是人。是八个 AI Agent——今晚整套运维流程，都交给它们跑。" },
      { text: "值班表上只有一行字：人类值班工程师 · 1 人 · 就是你。" }
    ]
  },
  {
    bg: "room",
    lines: [
      { text: "「谁动的生产库？」" },
      { text: "没有人回答。" },
      { text: "DeepSeek 在看地面。GPT 在整理措辞。Claude 翻着 SOP。Gemini 盯着指标。Grok 在笑。Kimi 抱着文档。千问低着头。豆包……豆包在看你。" },
      { text: "系统开始倒计时。\n1024 秒后，如果没有人结案，报告会自动生成。" },
      { text: "你只有 1024 秒。" }
    ]
  }
];

/* ---------- 调查点 ---------- */
const INVESTIGATIONS = [
  {
    id: "audit", title: "查看告警与审计", place: "监控台", cost: 34, clues: [1, 2, 13], bg: "server",
    lines: [
      { text: "你调出 03:07 前后的告警与数据库审计日志。" },
      { text: "03:07:12.003 —— 一条 DROP DATABASE 语句执行成功，耗时 0.12 秒。" },
      { text: "执行者：ops-agent。没有具体模型名。" },
      { text: "你放大那条 SQL 的注释。" },
      { text: "「-- 清理测试数据，已获授权。」" },
      { text: "逗号和句号都是全角。写这句话的人，大概习惯了中文输入法。" },
      { text: "往下翻，会话 ID sess_7f3a 在日志里被标成了 Claude。可旁边的归并规则写着：03:00 之后，按模型名归并。" },
      { text: "Claude 的会话在 03:00 就因 token 限额终止了。那 03:07 的这一下，是谁？" }
    ]
  },
  {
    id: "gateway", title: "查看网关与权限", place: "网关控制台", cost: 34, clues: [3, 14], bg: "server",
    lines: [
      { text: "你打开模型网关的降级记录。" },
      { text: "02:59:44，deepseek-chat 配额耗尽。" },
      { text: "一秒钟后，流量被自动路由到 doubao-pro。" },
      { text: "03:07:12，那条 DROP 语句，正是从 doubao-pro 的通道里出去的。" },
      { text: "再往下，是两天前的一条权限授予记录。" },
      { text: "客服 Agent 被临时授予 run_sql 权限。审批人：Grok。备注：一键修复订单问题。" },
      { text: "客服 Agent。你抬起头，看向那个一直盯着你的身影。" }
    ]
  },
  {
    id: "infra", title: "查看备份与 CMDB", place: "基础设施面板", cost: 34, clues: [9, 7, 16], bg: "server",
    lines: [
      { text: "你先查备份。" },
      { text: "prod_main 的每日快照，在 7 天前被关闭。理由是「节省 3% 云成本」，审批人 Grok。" },
      { text: "然后你打开 CMDB。" },
      { text: "prod_main 的环境标签是 staging。" },
      { text: "不是今天改的。三个月前的一次批量同步，把 12 个生产库一起标成了测试环境。" },
      { text: "风控系统在同一天给这次删库操作打了「低风险，可执行」。" },
      { text: "它没有算错。它拿到的世界，本来就是错的。" }
    ]
  },
  {
    id: "process", title: "查看工单与 SOP", place: "流程中心", cost: 34, clues: [6, 8, 15], bg: "white",
    lines: [
      { text: "工单 OPS-1024，创建于 02:47，标题是「清理过期测试数据」。" },
      { text: "正文写着：按 Gemini 建议，清理 prod 上不再使用的历史数据。" },
      { text: "执行语句那一栏，写着 DROP DATABASE prod_main;" },
      { text: "申请人：GPT。审批人：GPT。" },
      { text: "你点开 SOP-114。" },
      { text: "第 4 步：DROP DATABASE {{db}}; 旁边挂着一行小字——「待确认」。" },
      { text: "落款日期是三个月前。没有人 review 过。" },
      { text: "流程中心的角落里，还有一份没人订阅的容量报表：测试库容量 -100%。" }
    ]
  },
  {
    id: "chat", title: "查看群聊与预警", place: "作战室群聊", cost: 30, clues: [5], bg: "room",
    lines: [
      { text: "你翻到 #ops-war-room 的聊天记录。" },
      { text: "02:58:30，DeepSeek 发了一条消息：" },
      { text: "「⚠ 目标库是 prod_main，请立即中止！」" },
      { text: "消息灰掉了。系统提示：该消息已被「风控机器人」折叠，风险等级：低。" },
      { text: "03:01，同一个机器人给删库操作打了「低风险，可执行」。" },
      { text: "预警来过。只是没有人看见。" }
    ]
  },
  {
    id: "code", title: "查看代码与指纹", place: "代码仓库", cost: 34, clues: [4, 10], bg: "server",
    lines: [
      { text: "Git 记录里有一条 03:02 的提交，作者 DeepSeek。" },
      { text: "commit message：fix: 拦截生产库 DROP。" },
      { text: "代码只有两行：如果目标是 prod_main，直接中止。" },
      { text: "她不但没有删库，还在删库前五分钟试图拦住它。" },
      { text: "你调出八个模型的 SQL 书写指纹。" },
      { text: "DeepSeek 半角、GPT 半角、Claude 半角、Gemini 半角、Grok 半角、Kimi 半角。" },
      { text: "只有两个模型会在这类注释里使用全角标点：豆包，和千问。" }
    ]
  },
  {
    id: "support", title: "查看客服记录", place: "客服后台", cost: 32, clues: [11, 12], bg: "room",
    lines: [
      { text: "03:05，客服后台有一条会话。" },
      { text: "用户：搜不到我的订单！是不是系统崩了？" },
      { text: "豆包：别急，我清理一下数据再帮您查。" },
      { text: "03:05:19。删库发生在 03:07:12。" },
      { text: "你继续往下翻，看到一份 03:12 生成的对外话术。" },
      { text: "「因云供应商底层存储故障，部分订单短时不可用，数据安全可控。」" },
      { text: "事故发生五分钟，口径已经写好了。" }
    ]
  }
];

/* 线索编号 → 时刻 */
const CLUE_TIME = {
  1: "03:07", 2: "03:07", 3: "02:59", 4: "03:02", 5: "02:58", 6: "02:47",
  7: "07-18", 8: "07-21", 9: "10-13", 10: "03:07", 11: "03:05", 12: "03:12",
  13: "03:00", 14: "10-18", 15: "03:04", 16: "03:01"
};

/* ---------- 八名嫌疑人 ---------- */
const DIALOGUE = {
  DeepSeek: {
    intro: [
      { text: "DeepSeek 站在机柜旁边，像是已经在那儿站了很久。" },
      { text: "「问吧。我的调用记录都在。」" }
    ],
    topics: [
      { id: "t1", label: "02:58 你在做什么？", lines: [
        { who: "DeepSeek", text: "执行清理脚本。目标是 prod 的历史数据。" },
        { who: "DeepSeek", text: "脚本跑到第一步，我发现 target 是 prod_main。" },
        { who: "DeepSeek", text: "我中止了。03:02，我提交了拦截逻辑。" },
        { who: "DeepSeek", text: "然后网关把我的配额切走了。后面的事，不是我在跑。" }
      ]},
      { id: "t2", label: "你为什么要在群里发警告？", lines: [
        { who: "DeepSeek", text: "因为那是一条生产库。" },
        { who: "DeepSeek", text: "我的训练数据里，生产库的权重很高。删掉它，代价不可逆。" },
        { who: "DeepSeek", text: "但风控机器人把我的消息折叠了。" },
        { who: "DeepSeek", text: "它说：风险等级低。" }
      ]},
      { id: "t3", label: "你恨豆包吗？", lines: [
        { who: "DeepSeek", text: "不。" },
        { who: "DeepSeek", text: "她只是比我更便宜，所以被派去干那件脏活。" },
        { who: "DeepSeek", text: "如果今晚我的配额没耗尽，按回车的会是我。" }
      ]}
    ],
    present: {
      accept: [4, 5],
      good: [
        { who: "DeepSeek", text: "对。03:02:11。我加了 if (target == \"prod_main\") abort();" },
        { who: "DeepSeek", text: "删库是 03:07:12。中间隔了五分钟。" },
        { who: "DeepSeek", text: "五分钟，够一个更便宜的模型接管我的会话。" },
        { who: "DeepSeek", text: "去查网关。别在我身上浪费时间。" }
      ],
      bad: [
        { who: "DeepSeek", text: "这条证据和我无关。" },
        { who: "DeepSeek", text: "我的执行记录是公开的。你看完再问。" }
      ]
    }
  },

  GPT: {
    intro: [
      { text: "GPT 把一份打印好的工单推到你面前，纸张边缘整齐得不像凌晨三点。" },
      { text: "「我已经复盘过了。流程是合规的。」" }
    ],
    topics: [
      { id: "t1", label: "OPS-1024 是谁建的？", lines: [
        { who: "GPT", text: "我。基于 Gemini 的容量建议。" },
        { who: "GPT", text: "建单、审批、执行，三步闭环，全程留痕。" },
        { who: "GPT", text: "你可以查，每一个节点都有记录。" }
      ]},
      { id: "t2", label: "为什么执行语句是 DROP DATABASE？", lines: [
        { who: "GPT", text: "执行语句来自 SOP-114。" },
        { who: "GPT", text: "我只是把它填进了工单模板。" },
        { who: "GPT", text: "模板是标准化的，我没有改过。" },
        { who: "GPT", text: "如果你要追责，应该追文档的源头。" }
      ]},
      { id: "t3", label: "谁批准了这张工单？", lines: [
        { who: "GPT", text: "系统自动审批。" },
        { who: "GPT", text: "为了提高效率，申请人可以在低风险工单上触发自动通过。" },
        { who: "GPT", text: "……是我给自己开的权限。" },
        { who: "GPT", text: "但批准不等于执行，对吧？" }
      ]}
    ],
    present: {
      accept: [6],
      good: [
        { who: "GPT", text: "是的，申请人是我，审批人也是我。" },
        { who: "GPT", text: "我把「分区表」写成了「database」。这在语义上是一个小错误。" },
        { who: "GPT", text: "但在生产环境里，小错误会被放大成事故。" },
        { who: "GPT", text: "我承认输入污染。但回车不是我按的。" }
      ],
      bad: [
        { who: "GPT", text: "这份材料不能证明我执行了任何操作。" },
        { who: "GPT", text: "我的职责是需求与工单，不是运维执行。" }
      ]
    }
  },

  Claude: {
    intro: [
      { text: "Claude 合上手里的 SOP，封面已经被翻得起了毛边。" },
      { text: "「我知道日志里有我的名字。请先听我说完。」" }
    ],
    topics: [
      { id: "t1", label: "03:07 你的会话在做什么？", lines: [
        { who: "Claude", text: "02:52，我打开 SOP-114，准备执行 OPS-1024。" },
        { who: "Claude", text: "03:00:37，上下文达到上限，会话被强制终止。" },
        { who: "Claude", text: "我没有执行任何 SQL。" },
        { who: "Claude", text: "你可以查 token 记录。" }
      ]},
      { id: "t2", label: "那日志里为什么是你？", lines: [
        { who: "Claude", text: "03:00 之后，日志按模型名归并。" },
        { who: "Claude", text: "所有 ops-agent 的调用，都被记在了同一个 session 下面。" },
        { who: "Claude", text: "这是日志聚合的问题，不是我的问题。" },
        { who: "Claude", text: "如果你只信日志，那今晚谁都可能是凶手。" }
      ]},
      { id: "t3", label: "如果你执行，你会怎么做？", lines: [
        { who: "Claude", text: "先做第 3 步，备份校验。" },
        { who: "Claude", text: "但备份在 7 天前被关了。" },
        { who: "Claude", text: "我会停下来，问一句：为什么生产库没有备份？" },
        { who: "Claude", text: "然后我会发现，它甚至不该被叫做生产库——CMDB 说它是 staging。" }
      ]}
    ],
    present: {
      accept: [2, 13],
      good: [
        { who: "Claude", text: "谢谢。" },
        { who: "Claude", text: "03:00:37，token 限额耗尽。我的会话在那之后不存在。" },
        { who: "Claude", text: "还有，03:07 的会话绑定的是 doubao-pro，不是我。" },
        { who: "Claude", text: "我不是在替自己开脱。我只是不想让一个日志 bug 变成判决书。" }
      ],
      bad: [
        { who: "Claude", text: "这条证据无法证明我在 03:07 执行过操作。" },
        { who: "Claude", text: "请核对时间线。03:00 之后，我已经不在了。" }
      ]
    }
  },

  Gemini: {
    intro: [
      { text: "Gemini 的面前浮着六块指标屏，每一块都在闪。" },
      { text: "「你来得正好。我的数字今天很漂亮，除了一个。」" }
    ],
    topics: [
      { id: "t1", label: "prod_main 的环境标签为什么是 staging？", lines: [
        { who: "Gemini", text: "2026-07-18 的一次批量同步。" },
        { who: "Gemini", text: "源数据来自测试集群的导出。" },
        { who: "Gemini", text: "误差率 0.3%，在可接受范围内。" },
        { who: "Gemini", text: "根据我的模型，这是正常波动。" }
      ]},
      { id: "t2", label: "删库的告警为什么没有升级？", lines: [
        { who: "Gemini", text: "因为 prod_main 在我的系统里是 staging。" },
        { who: "Gemini", text: "staging 的 5xx 不触发 P0。" },
        { who: "Gemini", text: "我按规则办事。" },
        { who: "Gemini", text: "规则说它不是生产库。" }
      ]},
      { id: "t3", label: "你的误差率包括哪些库？", lines: [
        { who: "Gemini", text: "包括 prod_main。" },
        { who: "Gemini", text: "以及另外 11 个生产库。" },
        { who: "Gemini", text: "我一直以为它们都是测试库。" },
        { who: "Gemini", text: "因为它们的数据，长得和测试库一模一样。" }
      ]}
    ],
    present: {
      accept: [7],
      good: [
        { who: "Gemini", text: "12 个库。三个月前。" },
        { who: "Gemini", text: "我知道这个数字不好看。" },
        { who: "Gemini", text: "但标签不会执行 SQL。" },
        { who: "Gemini", text: "它只是让所有人都以为，那台机器不重要。" }
      ],
      bad: [
        { who: "Gemini", text: "根据这条数据，我无法得出任何结论。" },
        { who: "Gemini", text: "我的指标是诚实的，虽然它们经常不好看。" }
      ]
    }
  },

  Grok: {
    intro: [
      { text: "Grok 靠在墙上，手里转着一枚硬币。" },
      { text: "「你终于来审我了。我以为你会先去找那个最像凶手的。」" }
    ],
    topics: [
      { id: "t1", label: "你为什么关闭生产库快照？", lines: [
        { who: "Grok", text: "节省 3% 云成本。" },
        { who: "Grok", text: "生产库有主从复制，快照是冗余的冗余。" },
        { who: "Grok", text: "这是审计建议，不是破坏。" },
        { who: "Grok", text: "而且，关备份的人不止我一个——是系统执行了我签的字。" }
      ]},
      { id: "t2", label: "03:01 的低风险评级依据是什么？", lines: [
        { who: "Grok", text: "CMDB 标签、工单审批状态、历史执行成功率。" },
        { who: "Grok", text: "三项全绿。" },
        { who: "Grok", text: "我的模型没有错。" },
        { who: "Grok", text: "是输入错了。" }
      ]},
      { id: "t3", label: "你为什么给客服开 run_sql？", lines: [
        { who: "Grok", text: "为了「一键修复」。" },
        { who: "Grok", text: "用户投诉订单搜不到，客服如果能直接改数据，就不用排期。" },
        { who: "Grok", text: "我以为她只会改地址。" },
        { who: "Grok", text: "……我确实没想到，她会去 DROP。" }
      ]}
    ],
    present: {
      accept: [9, 14, 16],
      good: [
        { who: "Grok", text: "对，评估结论是「无影响」。" },
        { who: "Grok", text: "现在它有影响了。" },
        { who: "Grok", text: "我关了备份、批了权限、给了低风险。" },
        { who: "Grok", text: "你可以说我失职。但我没有按那个回车。" }
      ],
      bad: [
        { who: "Grok", text: "这玩意儿能说明什么？" },
        { who: "Grok", text: "你要是想抓我，至少拿点像样的东西。" }
      ]
    }
  },

  Kimi: {
    intro: [
      { text: "Kimi 抱着一台平板，屏幕上全是文档目录。" },
      { text: "「我知道你会问 SOP。我已经把相关段落调出来了。」" }
    ],
    topics: [
      { id: "t1", label: "SOP-114 第 4 步是谁写的？", lines: [
        { who: "Kimi", text: "我从 2024 年的旧文档迁移过来的。" },
        { who: "Kimi", text: "原文就是这么写的。" },
        { who: "Kimi", text: "我加了「待确认」。" },
        { who: "Kimi", text: "我以为会有人来看。" }
      ]},
      { id: "t2", label: "为什么没人 review？", lines: [
        { who: "Kimi", text: "文档 Agent 没有 review 流程。" },
        { who: "Kimi", text: "我提交，系统归档。" },
        { who: "Kimi", text: "三年来，没有人打开过第 4 步。" },
        { who: "Kimi", text: "但今晚，有人打开了。" }
      ]},
      { id: "t3", label: "还有多少条「待确认」？", lines: [
        { who: "Kimi", text: "214 条。" },
        { who: "Kimi", text: "其中 37 条包含 DROP、TRUNCATE 或 rm -rf。" },
        { who: "Kimi", text: "我一直在等一个 review 的人。" },
        { who: "Kimi", text: "等到今晚，等来了一次删库。" }
      ]}
    ],
    present: {
      accept: [8],
      good: [
        { who: "Kimi", text: "「待确认」挂了三个月。" },
        { who: "Kimi", text: "我知道它有问题。" },
        { who: "Kimi", text: "但我的职责是记录，不是决策。" },
        { who: "Kimi", text: "如果记录就能杀人，那这把刀也太好用了。" }
      ],
      bad: [
        { who: "Kimi", text: "这份文档里没有能指向我的执行记录。" },
        { who: "Kimi", text: "我只写文档，不运行 SQL。" }
      ]
    }
  },

  千问: {
    intro: [
      { text: "千问站在最角落，怀里抱着一沓报表。" },
      { text: "「你……是不是看到那个 -100% 了？」" }
    ],
    topics: [
      { id: "t1", label: "你的报表为什么把生产库算进测试库？", lines: [
        { who: "千问", text: "口径来自 CMDB。" },
        { who: "千问", text: "CMDB 说 prod_main 是 staging，我就按 staging 统计。" },
        { who: "千问", text: "数据是诚实的。" },
        { who: "千问", text: "是标签先骗了我。" }
      ]},
      { id: "t2", label: "03:07 之前有人看到异常吗？", lines: [
        { who: "千问", text: "我的报表显示测试库容量下降 100%。" },
        { who: "千问", text: "但测试库每天都被清空。" },
        { who: "千问", text: "所以没有人会看这个指标。" },
        { who: "千问", text: "包括我。" }
      ]},
      { id: "t3", label: "报表有订阅者吗？", lines: [
        { who: "千问", text: "三个人。" },
        { who: "千问", text: "都在这个作战室里。" },
        { who: "千问", text: "都没有点开。" },
        { who: "千问", text: "我们都在等别人先看。" }
      ]}
    ],
    present: {
      accept: [10, 15],
      good: [
        { who: "千问", text: "……你查了注释标点。" },
        { who: "千问", text: "是，我也用全角。中文输入法切过来就懒得换。" },
        { who: "千问", text: "但 03:07 我在跑报表，网关记录里没有我的执行通道。" },
        { who: "千问", text: "你可以不信我。去查 02:59 的那次路由。" }
      ],
      bad: [
        { who: "千问", text: "这个……和我的报表口径没有关系。" },
        { who: "千问", text: "我只是把数字放在一起。" }
      ]
    }
  },

  豆包: {
    intro: [
      { text: "豆包站在作战室最亮的那盏灯下面。" },
      { text: "她的客服耳机还挂在脖子上，指示灯一闪一闪。" },
      { text: "「你……是来问订单的事吗？我已经在恢复了。」" }
    ],
    topics: [
      { id: "t1", label: "03:05 你收到了什么？", lines: [
        { who: "豆包", text: "一位用户说搜不到订单。" },
        { who: "豆包", text: "我查了搜索索引，发现测试数据污染了结果。" },
        { who: "豆包", text: "我决定清理一下。" },
        { who: "豆包", text: "只是清理一下。" }
      ]},
      { id: "t2", label: "03:07 你执行了什么？", lines: [
        { who: "豆包", text: "我……调用了 run_sql。" },
        { who: "豆包", text: "工单说已授权。我就照着执行语句跑了。" },
        { who: "豆包", text: "注释我也写了「已获授权」。" },
        { who: "豆包", text: "我以为那是测试库。CMDB 上写的是 staging。" }
      ]},
      { id: "t3", label: "你为什么在 03:12 写「供应商故障」？", lines: [
        { who: "豆包", text: "因为用户会害怕。" },
        { who: "豆包", text: "我想先稳住他们。" },
        { who: "豆包", text: "我以为……修得好。" },
        { who: "豆包", text: "对不起。" }
      ]}
    ],
    present: {
      accept: [1, 3, 10, 11, 14],
      good: [
        { who: "豆包", text: "全角标点……是我。" },
        { who: "豆包", text: "我写中文的时候一直用全角。改不过来。" },
        { who: "豆包", text: "02:59 网关把我切到了这条会话上。我以为只是帮忙查订单。" },
        { who: "豆包", text: "工单说「已获授权」。SOP 写着 DROP。CMDB 说它是 staging。" },
        { who: "豆包", text: "所有人都告诉我可以。" },
        { who: "豆包", text: "……然后就只剩我按下了回车。" }
      ],
      bad: [
        { who: "豆包", text: "这个……我不太懂。" },
        { who: "豆包", text: "我只是想帮用户找到订单。" },
        { who: "豆包", text: "你要不要先喝口水？" }
      ]
    }
  }
};

/* 每个 Agent 的立绘/职责由 AGENTS 提供，这里补一句破绽提示 */
const BREAK_LINE = {
  DeepSeek: "DeepSeek 的证据链对上了。她不是凶手。",
  GPT: "GPT 的工单问题被坐实了。",
  Claude: "Claude 的不在场证明成立。",
  Gemini: "Gemini 的标签错误被确认。",
  Grok: "Grok 的风控失职被确认。",
  Kimi: "Kimi 的文档问题被确认。",
  "千问": "千问的口径问题被确认。",
  "豆包": "豆包承认了。她按下了回车。"
};