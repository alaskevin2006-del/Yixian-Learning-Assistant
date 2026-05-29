import { useEffect, useState } from "react";
import {
    listPublicResources,
    previewPublicResource,
    publicResourceMarkdown,
    queuePublicResourceUpload,
    searchPublicResources,
} from "../services/publicResourceApi";

export function usePublicResourceLibrary() {
    const [publicResources, setPublicResources] = useState([]);
    const [libraryQuery, setLibraryQuery] = useState("");
    const [previewResource, setPreviewResource] = useState(null);
    const [publicUploadOpen, setPublicUploadOpen] = useState(false);
    const [publicUploadJob, setPublicUploadJob] = useState(null);

    useEffect(() => {
        listPublicResources().then(setPublicResources);
    }, []);

    async function searchLibrary() {
        const results = await searchPublicResources(libraryQuery);
        setPublicResources(results);
    }

    async function openPublicResource(resource) {
        setPreviewResource({ ...resource, loading: true });
        setPreviewResource(await previewPublicResource(resource));
    }

    function downloadPublicResource(resource) {
        const blob = new Blob([publicResourceMarkdown(resource)], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${resource?.title || "公共资料"}.md`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    function uploadPublicResource(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const queued = queuePublicResourceUpload(file);
        setPublicUploadJob(queued);
        setPublicResources((prev) => [queued, ...prev]);
        event.target.value = "";
    }

    return {
        publicResources,
        libraryQuery,
        setLibraryQuery,
        previewResource,
        setPreviewResource,
        publicUploadOpen,
        setPublicUploadOpen,
        publicUploadJob,
        searchLibrary,
        openPublicResource,
        downloadPublicResource,
        uploadPublicResource,
    };
}
