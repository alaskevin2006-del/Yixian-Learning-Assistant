import { retrieveContext } from "./resourceApi";

const DEMO_SOURCE = "demo";
const DEMO_PUBLIC_RESOURCES = [
    {
        resourceId: "resource-demo-supervised-learning",
        chunkId: "lecture-01",
        scope: "public",
        title: "范例：课程讲义：监督学习基础",
        fileType: "PDF",
        path: "范例资料 / 机器学习导论 / 课程讲义",
        chapter: "监督学习基础",
        section: "训练、验证与泛化",
        tags: ["范例", "机器学习导论", "监督学习"],
        contentPreview: "监督学习以带标签数据为基础，通过训练集学习模型参数，并使用验证集检查泛化能力。复习重点包括特征、标签、损失函数、过拟合与正则化。",
        canPreview: true,
        canDownload: true,
        canReference: true,
        source: DEMO_SOURCE,
        isDemo: true,
    },
    {
        resourceId: "resource-demo-metrics-note",
        chunkId: "note-01",
        scope: "public",
        title: "范例：笔记：模型评估指标",
        fileType: "MD",
        path: "范例资料 / 机器学习导论 / 复习笔记",
        chapter: "模型评估",
        section: "分类指标对比",
        tags: ["范例", "模型评估", "precision", "recall", "F1", "ROC-AUC"],
        contentPreview: "accuracy 适合类别相对均衡的场景；precision 关注预测为正的样本有多少是真的；recall 关注真实正样本找回了多少；F1 平衡 precision 与 recall。",
        canPreview: true,
        canDownload: true,
        canReference: true,
        source: DEMO_SOURCE,
        isDemo: true,
    },
    {
        resourceId: "resource-demo-past-paper",
        chunkId: "exam-01",
        scope: "public",
        title: "范例：往年题：机器学习导论期末样题",
        fileType: "PDF",
        path: "范例资料 / 机器学习导论 / 往年题",
        chapter: "期末样题",
        section: "综合练习",
        tags: ["范例", "往年题", "期末复习"],
        contentPreview: "样题覆盖监督学习基本概念、线性回归、逻辑回归、模型评估指标和神经网络基础，适合在第二周进行限时练习。",
        canPreview: true,
        canDownload: true,
        canReference: true,
        source: DEMO_SOURCE,
        isDemo: true,
    },
    {
        resourceId: "resource-demo-neural-network-sheet",
        chunkId: "summary-01",
        scope: "public",
        title: "范例：总结：神经网络基础速查表",
        fileType: "MD",
        path: "范例资料 / 机器学习导论 / 速查表",
        chapter: "神经网络基础",
        section: "前向传播与反向传播",
        tags: ["范例", "神经网络", "速查表"],
        contentPreview: "速查表整理前向传播、激活函数、损失函数、反向传播链式法则、学习率和过拟合控制方法，用于睡前轻量回顾。",
        canPreview: true,
        canDownload: true,
        canReference: true,
        source: DEMO_SOURCE,
        isDemo: true,
    },
];

function matchesResource(resource, query) {
    const trimmed = String(query || "").trim().toLowerCase();
    if (!trimmed) return true;
    return [
        resource.title,
        resource.path,
        resource.chapter,
        resource.section,
        resource.tags,
        resource.contentPreview,
    ].flat().join(" ").toLowerCase().includes(trimmed);
}

export function listPendingPublicUploads() {
    return [];
}

export function queuePublicResourceUpload(file) {
    return {
        resourceId: `public-upload-${Date.now().toString(36)}`,
        chunkId: "",
        scope: "public",
        title: file?.name || "未命名公共资料",
        fileType: String(file?.name || "").split(".").pop()?.toUpperCase() || "FILE",
        path: "公共资料 / 待处理上传",
        chapter: "待处理",
        section: "等待公共资料处理流程",
        contentPreview: "文件已进入本地待处理队列。接入公共资料切片、审核、向量入库后会替换为真实公共资料记录。",
        canPreview: true,
        canDownload: false,
        canReference: false,
        uploadStatus: "pending_processing",
        createdAt: new Date().toISOString(),
    };
}

export async function listPublicResources(query = "") {
    const pending = listPendingPublicUploads();
    const base = pending.length > 0 ? pending : DEMO_PUBLIC_RESOURCES;
    if (!String(query || "").trim()) return base;
    return base.filter((item) => matchesResource(item, query));
}

export async function searchPublicResources(query) {
    const trimmed = String(query || "").trim();
    if (!trimmed) return listPublicResources();
    return listPublicResources(trimmed);
}

export async function previewPublicResource(resource) {
    if (resource?.source === DEMO_SOURCE || resource?.isDemo) {
        return { ...resource, loading: false };
    }
    if (!resource || resource.uploadStatus) {
        return { ...resource, loading: false };
    }
    const context = await retrieveContext(resource.title || resource.contentPreview || "资料", {
        references: [{ resourceId: resource.resourceId, chunkId: resource.chunkId }],
        scope: "public",
        maxChars: 3200,
    }).catch(() => ({ contextText: resource.contentPreview || "", citations: [] }));
    return {
        ...resource,
        contentPreview: context.contextText || resource.contentPreview || "",
        citations: context.citations || [],
        loading: false,
    };
}

export function publicResourceMarkdown(resource) {
    return [
        `# ${resource?.title || "公共资料"}`,
        "",
        resource?.path ? `路径：${resource.path}` : "",
        resource?.chapter || resource?.section ? `章节：${[resource.chapter, resource.section].filter(Boolean).join(" / ")}` : "",
        "",
        resource?.contentPreview || "当前公共资料不提供原文件下载，可通过打开或引用查看切片内容。",
    ].filter(Boolean).join("\n");
}
