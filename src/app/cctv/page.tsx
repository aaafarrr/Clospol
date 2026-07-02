"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import SidebarLayout from "@/components/layout/sidebar";
import { useToast } from "@/components/providers/toast-provider";

interface CameraItem {
  id: string;
  name: string;
  streamUrl: string;
  snapshotUrl: string | null;
  scheduleCron: string | null;
  recordStream: boolean;
  recordInterval: number;
  retentionDays: number;
  status: string;
  connectedAccountId: string | null;
  snapshotHeaders: Record<string, any>;
  lastCaptureAt: string | null;
  lastCaptureStatus: string | null;
  lastCaptureError: string | null;
}

interface GalleryFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
  downloadUrl: string;
  viewUrl: string;
}

interface HeaderRow {
  key: string;
  value: string;
  value_type?: string;
}

export default function CctvPage() {
  if (process.env.NEXT_PUBLIC_FEATURE_CCTV === "false") {
    return (
      <SidebarLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4 animate-in fade-in duration-200">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-2xl shadow-sm">
            <i className="fa-solid fa-lock"></i>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">CCTV Feature Disabled</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            The CCTV Stream decoders and archiving module has been disabled during installation. Contact your administrator or update your environment configuration to enable this module.
          </p>
        </div>
      </SidebarLayout>
    );
  }

  const getLocalDateString = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const date = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${date}`;
  };

  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [activeCamera, setActiveCamera] = useState<CameraItem | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<GalleryFile[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [capturingSnapId, setCapturingSnapId] = useState<string | null>(null);
  const [recordingClip, setRecordingClip] = useState(false);
  const toast = useToast();
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Scrubber/Timeline states
  const [activeMode, setActiveMode] = useState<"live" | "playback_video" | "playback_image">("live");
  const [playbackUrl, setPlaybackUrl] = useState<string>("");
  const [playbackFile, setPlaybackFile] = useState<GalleryFile | null>(null);
  const [timelineDate, setTimelineDate] = useState<string>("");
  const [timelineTime, setTimelineTime] = useState<number>(720); // minutes (0 to 1440), default 12:00
  const [timelineZoom, setTimelineZoom] = useState<number>(10); // minutes step (60, 30, 15, 10, 5, 1)
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [storageAccounts, setStorageAccounts] = useState<any[]>([]);

  // Filter, Sort and UI states
  const [filterType, setFilterType] = useState<"all" | "video" | "image">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "size_desc" | "size_asc">("date_desc");
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // Modal form states
  const [isOpenFormModal, setIsOpenFormModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editCameraId, setEditCameraId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [importingOnvif, setImportingOnvif] = useState(false);

  const [form, setForm] = useState({
    name: "",
    streamUrl: "",
    snapshotUrl: "",
    scheduleCron: "",
    recordStream: false,
    recordInterval: 5,
    retentionDays: 7,
    connectedAccountId: "routing_policy",
    connectionType: "standard",
    onvifUrl: "",
    onvifUsername: "",
    onvifPassword: "",
  });

  const [headersList, setHeadersList] = useState<HeaderRow[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const hlsInstanceRef = useRef<any>(null);
  const heartbeatIntervalRef = useRef<any>(null);

  const dragStartXRef = useRef<number>(0);
  const dragStartScrollLeftRef = useRef<number>(0);
  const ignoreTimeUpdateRef = useRef<boolean>(false);
  const ignoreTimeUpdateTimeoutRef = useRef<any>(null);

  // Load cameras
  const loadCameras = async () => {
    try {
      const res = await fetch("/api/cctv");
      const data = await res.json();
      setCameras(data.cameras || []);
    } catch (err) {
      console.error("Failed to load CCTV cameras:", err);
    }
  };

  // Load storage accounts for modal form
  const loadStorageAccounts = async () => {
    try {
      const res = await fetch("/api/storages");
      const data = await res.json();
      setStorageAccounts(data.accounts || []);
    } catch (err) {
      console.error("Failed to load connected storage accounts:", err);
    }
  };

  useEffect(() => {
    loadCameras();
    loadStorageAccounts();
    setTimelineDate(getLocalDateString()); // YYYY-MM-DD (local time)
  }, []);

  // Update container width on mount and resize
  useEffect(() => {
    const handleResize = () => {
      const track = timelineTrackRef.current;
      if (track) {
        setContainerWidth(track.clientWidth);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeCamera, activeMode]);

  // Clean up HLS player and heartbeats on unmount
  useEffect(() => {
    return () => {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);

  const loadGallery = async (cameraId: string) => {
    setLoadingGallery(true);
    try {
      const res = await fetch(`/api/cctv/${cameraId}/gallery`);
      const data = await res.json();
      setGalleryFiles(data.files || []);
    } catch (err) {
      console.error("Failed to load CCTV gallery:", err);
    } finally {
      setLoadingGallery(false);
    }
  };

  const getSerializedHeaders = () => {
    const headersObj: Record<string, any> = {};
    headersList.forEach((item) => {
      if (item.key.trim() !== "") {
        headersObj[item.key.trim()] = item.value;
      }
    });

    if (form.connectionType === "onvif" && form.onvifUrl) {
      headersObj.__onvif__ = {
        url: form.onvifUrl,
        username: form.onvifUsername,
        password: form.onvifPassword,
      };
    }
    return headersObj;
  };

  const addHeaderRow = () => {
    setHeadersList((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeHeaderRow = (idx: number) => {
    setHeadersList((prev) => prev.filter((_, i) => i !== idx));
  };

  const addHeaderPreset = (type: "jwt" | "basic") => {
    if (type === "jwt") {
      setHeadersList((prev) => [...prev, { key: "Authorization", value: "Bearer " }]);
    } else if (type === "basic") {
      setHeadersList((prev) => [...prev, { key: "Authorization", value: "Basic " }]);
    }
  };

  const updateHeaderRow = (idx: number, field: "key" | "value", value: string) => {
    setHeadersList((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const openAddModal = () => {
    cancelEdit();
    setIsOpenFormModal(true);
  };

  const openEditModal = (camera: CameraItem) => {
    setIsEdit(true);
    setEditCameraId(camera.id);
    setForm({
      name: camera.name,
      streamUrl: camera.streamUrl,
      snapshotUrl: camera.snapshotUrl || "",
      scheduleCron: camera.scheduleCron || "",
      recordStream: camera.recordStream,
      recordInterval: camera.recordInterval || 5,
      retentionDays: camera.retentionDays,
      connectedAccountId: camera.connectedAccountId || "routing_policy",
      connectionType: "standard",
      onvifUrl: "",
      onvifUsername: "",
      onvifPassword: "",
    });

    const parsedHeaders: HeaderRow[] = [];
    if (camera.snapshotHeaders) {
      Object.entries(camera.snapshotHeaders).forEach(([key, value]) => {
        if (key === "__onvif__") {
          setForm((prev) => ({
            ...prev,
            connectionType: "onvif",
            onvifUrl: value.url || "",
            onvifUsername: value.username || "",
            onvifPassword: value.password || "",
          }));
        } else {
          parsedHeaders.push({ key, value: String(value) });
        }
      });
    }
    setHeadersList(parsedHeaders);
    setIsOpenFormModal(true);
  };

  const cancelEdit = () => {
    setIsEdit(false);
    setEditCameraId(null);
    setIsOpenFormModal(false);
    setForm({
      name: "",
      streamUrl: "",
      snapshotUrl: "",
      scheduleCron: "",
      recordStream: false,
      recordInterval: 5,
      retentionDays: 7,
      connectedAccountId: "routing_policy",
      connectionType: "standard",
      onvifUrl: "",
      onvifUsername: "",
      onvifPassword: "",
    });
    setHeadersList([]);
  };

  const importOnvifDetails = async () => {
    if (!form.onvifUrl) {
      toast.warn("Please fill out the ONVIF device service URL.");
      return;
    }
    setImportingOnvif(true);
    try {
      const res = await fetch("/api/cctv/onvif", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          onvifUrl: form.onvifUrl,
          onvifUsername: form.onvifUsername || null,
          onvifPassword: form.onvifPassword || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to query ONVIF service.");
      }

      setForm((prev) => ({
        ...prev,
        streamUrl: data.rtspUrl || data.snapshotUrl || prev.streamUrl,
        snapshotUrl: data.snapshotUrl || prev.snapshotUrl,
      }));
      toast.success("Success: Connected to ONVIF service! Raw video and image endpoints imported successfully.");
    } catch (err: any) {
      toast.error("ONVIF Connection Failed: " + err.message);
    } finally {
      setImportingOnvif(false);
    }
  };

  const testCameraConnection = async () => {
    if (!form.streamUrl) {
      toast.warn("Please fill out the Live Stream URL.");
      return;
    }
    setFormLoading(true);
    try {
      const res = await fetch("/api/cctv/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamUrl: form.streamUrl,
          snapshotUrl: form.snapshotUrl || null,
          headers: getSerializedHeaders(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        toast.success("Success: CCTV Camera feed and snapshot urls verified successfully!");
      } else {
        toast.error("Connection Failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      toast.error("Request error testing CCTV camera URLs.");
    } finally {
      setFormLoading(false);
    }
  };

  const saveCamera = async () => {
    setFormLoading(true);
    try {
      const res = await fetch("/api/cctv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          streamUrl: form.streamUrl,
          snapshotUrl: form.snapshotUrl || null,
          scheduleCron: form.scheduleCron || null,
          recordStream: form.recordStream,
          recordInterval: Number(form.recordInterval),
          retentionDays: Number(form.retentionDays),
          connectedAccountId: form.connectedAccountId,
          headers: getSerializedHeaders(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save camera.");
      }

      toast.success("CCTV Camera linked and recording pipeline registered successfully!");
      cancelEdit();
      loadCameras();
    } catch (err: any) {
      toast.error(err.message || "Failed to save camera.");
    } finally {
      setFormLoading(false);
    }
  };

  const updateCamera = async () => {
    if (!editCameraId) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/cctv/${editCameraId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          streamUrl: form.streamUrl,
          snapshotUrl: form.snapshotUrl || null,
          scheduleCron: form.scheduleCron || null,
          recordStream: form.recordStream,
          recordInterval: Number(form.recordInterval),
          retentionDays: Number(form.retentionDays),
          connectedAccountId: form.connectedAccountId,
          headers: getSerializedHeaders(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update camera.");
      }

      toast.success("CCTV Camera configuration updated successfully!");
      cancelEdit();
      loadCameras();
    } catch (err: any) {
      toast.error(err.message || "Failed to update camera.");
    } finally {
      setFormLoading(false);
    }
  };

  const deleteCamera = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this CCTV camera config? Scheduled cloud uploads for this feed will be permanently stopped."
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/cctv/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Deletion failed");

      toast.success("CCTV Camera configuration deleted successfully.");
      if (activeCamera && activeCamera.id === id) {
        closeLiveView();
      }
      loadCameras();
    } catch (err) {
      toast.error("Failed to delete camera.");
    }
  };

  const startLiveMode = async (camera: CameraItem) => {
    // If we are already viewing this camera in live mode, do not re-initialize!
    if (activeCamera && activeCamera.id === camera.id && activeMode === "live" && !streamError && !streamLoading) {
      return;
    }

    setActiveCamera(camera);
    setActiveMode("live");
    setPlaybackUrl("");
    setPlaybackFile(null);
    setGalleryFiles([]);
    setStreamLoading(false);
    setStreamError(null);

    // Clear any existing heartbeat interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    const isRtsp = camera.streamUrl.toLowerCase().startsWith("rtsp://");

    if (isRtsp) {
      setStreamLoading(true);
      try {
        // Initialize the transcoding process on the backend
        const res = await fetch(`/api/cctv/${camera.id}/stream`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to initialize live stream.");
        }
        const data = await res.json();

        // Start client heartbeat to keep transcoding session alive
        heartbeatIntervalRef.current = setInterval(async () => {
          try {
            await fetch(`/api/cctv/${camera.id}/stream`, { method: "POST" });
          } catch (e) {
            console.warn("Heartbeat ping failed:", e);
          }
        }, 5000);

        setTimeout(() => {
          const video = document.getElementById("cctv-player") as HTMLVideoElement;
          if (!video) return;

          if (hlsInstanceRef.current) {
            hlsInstanceRef.current.destroy();
            hlsInstanceRef.current = null;
          }

          const Hls = (window as any).Hls;
          if (Hls && Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(data.hlsUrl);
            hls.attachMedia(video);
            hlsInstanceRef.current = hls;
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = data.hlsUrl;
          }
        }, 2500);

      } catch (err: any) {
        setStreamError(err.message);
        console.error("RTSP stream initialization failed:", err);
      } finally {
        setStreamLoading(false);
      }
    } else {
      setTimeout(() => {
        const video = document.getElementById("cctv-player") as HTMLVideoElement;
        if (!video) return;

        if (hlsInstanceRef.current) {
          hlsInstanceRef.current.destroy();
          hlsInstanceRef.current = null;
        }

        const Hls = (window as any).Hls;
        if (Hls && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(camera.streamUrl);
          hls.attachMedia(video);
          hlsInstanceRef.current = hls;
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = camera.streamUrl;
        }
      }, 100);
    }

    loadGallery(camera.id);
  };

  const startPlaybackMode = async (camera: CameraItem) => {
    // Clear any existing heartbeat interval and request stop for current camera if it was RTSP
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (activeCamera && activeCamera.streamUrl.toLowerCase().startsWith("rtsp://")) {
      fetch(`/api/cctv/${activeCamera.id}/stream`, { method: "DELETE" }).catch((err) => {
        console.warn("Failed to stop transcoding session:", err);
      });
    }

    setActiveCamera(camera);
    setActiveMode("playback_video");
    setPlaybackUrl("");
    setPlaybackFile(null);
    setGalleryFiles([]);

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }
    const video = document.getElementById("cctv-player") as HTMLVideoElement;
    if (video) {
      video.src = "";
    }

    setLoadingGallery(true);
    try {
      const res = await fetch(`/api/cctv/${camera.id}/gallery`);
      const data = await res.json();
      const files: GalleryFile[] = data.files || [];
      setGalleryFiles(files);

      // Find the first recording of the selected timeline date
      const dayFiles = files.filter((f) => {
        return parseFileDateTime(f).dateStr === timelineDate && !f.mimeType.includes("image/");
      });

      if (dayFiles.length > 0) {
        dayFiles.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        playPlayback(dayFiles[0], files);
      } else {
        const dayImages = files.filter((f) => {
          return parseFileDateTime(f).dateStr === timelineDate && f.mimeType.includes("image/");
        });
        if (dayImages.length > 0) {
          dayImages.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          playPlayback(dayImages[0], files);
        } else {
          setTimelineTime(720); // 12:00
          setTimeout(() => {
            syncTimelineScroll();
          }, 100);
        }
      }
    } catch (err) {
      console.error("Failed to load playback data:", err);
    } finally {
      setLoadingGallery(false);
    }
  };

  const closeLiveView = () => {
    // Clear any existing heartbeat interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    // Stop active camera transcoding process on backend
    if (activeCamera && activeCamera.streamUrl.toLowerCase().startsWith("rtsp://")) {
      fetch(`/api/cctv/${activeCamera.id}/stream`, { method: "DELETE" }).catch((err) => {
        console.warn("Failed to stop transcoding session:", err);
      });
    }

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }
    const video = document.getElementById("cctv-player") as HTMLVideoElement;
    if (video) {
      video.src = "";
    }
    setActiveCamera(null);
    setGalleryFiles([]);
    setActiveMode("live");
    setPlaybackUrl("");
    setPlaybackFile(null);
    setStreamLoading(false);
    setStreamError(null);
  };

  const captureCanvasSnapshot = async () => {
    const video = document.getElementById("cctv-player") as HTMLVideoElement;
    if (!video || !activeCamera) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    const base64Data = canvas.toDataURL("image/jpeg");

    try {
      const res = await fetch(`/api/cctv/${activeCamera.id}/client-snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Data }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload canvas snapshot.");
      }

      toast.success("Live canvas snapshot captured and saved directly to your cloud storage account!");
      loadGallery(activeCamera.id);
    } catch (err: any) {
      toast.error("Canvas Capture Failed: " + err.message);
    }
  };

  const triggerServerSnapshot = async (id: string) => {
    setCapturingSnapId(id);
    try {
      const res = await fetch(`/api/cctv/${id}/capture`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Snapshot failed");

      toast.success("Server snapshot captured and uploaded to cloud successfully!");
      if (activeCamera && activeCamera.id === id) {
        loadGallery(id);
      }
      loadCameras();
    } catch (err: any) {
      toast.error("Snapshot Trigger Failed: " + err.message);
    } finally {
      setCapturingSnapId(null);
    }
  };

  const triggerManualRecord = async (id: string) => {
    setRecordingClip(true);
    try {
      const res = await fetch(`/api/cctv/${id}/record`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video recording failed");

      toast.success("Live camera HLS stream segments recorded and uploaded as .ts clip successfully!");
      loadGallery(id);
      loadCameras();
    } catch (err: any) {
      toast.error("Video Recording Failed: " + err.message);
    } finally {
      setRecordingClip(false);
    }
  };

  const deleteGalleryFile = async (fileId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this recording file? It will be permanently removed from cloud storage."
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete file.");

      toast.success("Recording file deleted successfully.");
      if (activeCamera) {
        loadGallery(activeCamera.id);
      }
    } catch (err) {
      toast.error("Failed to delete file.");
    }
  };

  const temporaryIgnoreTimeUpdate = (duration = 1000) => {
    ignoreTimeUpdateRef.current = true;
    if (ignoreTimeUpdateTimeoutRef.current) {
      clearTimeout(ignoreTimeUpdateTimeoutRef.current);
    }
    ignoreTimeUpdateTimeoutRef.current = setTimeout(() => {
      ignoreTimeUpdateRef.current = false;
    }, duration);
  };

  const parseFileDateTime = (file: GalleryFile) => {
    if (!file || !file.createdAt) {
      return { dateStr: "", startMinutes: 0, timeLabel: "" };
    }
    const d = new Date(file.createdAt);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const date = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${date}`;
    const startMinutes = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

    const hrs = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    const timeLabel = `${hrs}:${mins}`;

    return {
      dateStr,
      startMinutes,
      timeLabel,
    };
  };

  const playPlayback = (file: GalleryFile, currentGallery = galleryFiles) => {
    temporaryIgnoreTimeUpdate(1500);
    const parsed = parseFileDateTime(file);
    setTimelineDate(parsed.dateStr);

    const sourceUrl = file.viewUrl || file.downloadUrl;

    if (file.mimeType.includes("image/")) {
      setTimelineTime(parsed.startMinutes);
      setPlaybackFile(file);
      setPlaybackUrl(sourceUrl);
      setActiveMode("playback_image");
      setTimeout(() => {
        syncTimelineScroll(parsed.startMinutes);
      }, 50);
    } else {
      const durationMin = activeCamera?.recordInterval || 5;
      const startMin = parsed.startMinutes - durationMin;
      setTimelineTime(startMin);
      setPlaybackFile(file);
      setPlaybackUrl(sourceUrl);
      setActiveMode("playback_video");

      setTimeout(() => {
        syncTimelineScroll(startMin);
        const video = document.getElementById("cctv-player") as HTMLVideoElement;
        if (!video) return;

        if (hlsInstanceRef.current) {
          hlsInstanceRef.current.destroy();
          hlsInstanceRef.current = null;
        }

        // HLS playback or standard video stream
        const Hls = (window as any).Hls;
        const isM3u8 = file.name.endsWith(".m3u8") || file.downloadUrl.includes(".m3u8");
        if (Hls && Hls.isSupported() && isM3u8) {
          const hls = new Hls();
          hls.loadSource(sourceUrl);
          hls.attachMedia(video);
          hlsInstanceRef.current = hls;
        } else {
          video.src = sourceUrl;
          video.play().catch((e) => console.log("Auto-play blocked or failed:", e));
        }
      }, 50);
    }
  };

  const restoreLiveFeed = () => {
    if (!activeCamera) return;
    startLiveMode(activeCamera);
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatBytes = (bytesStr: string) => {
    const bytes = Number(bytesStr || 0);
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Memoized filtered and sorted gallery files
  const filteredFiles = useMemo(() => {
    let result = [...galleryFiles];

    // 1. Filter by current active timeline date (daily view)
    if (timelineDate) {
      result = result.filter((f) => parseFileDateTime(f).dateStr === timelineDate);
    }

    // 2. Filter by media type
    if (filterType === "video") {
      result = result.filter((f) => !f.mimeType.includes("image/"));
    } else if (filterType === "image") {
      result = result.filter((f) => f.mimeType.includes("image/"));
    }

    // 3. Filter by search query
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(query));
    }

    // 4. Sort files
    result.sort((a, b) => {
      if (sortBy === "date_desc") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sortBy === "date_asc") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === "size_desc") {
        return Number(b.sizeBytes || 0) - Number(a.sizeBytes || 0);
      } else if (sortBy === "size_asc") {
        return Number(a.sizeBytes || 0) - Number(b.sizeBytes || 0);
      }
      return 0;
    });

    return result;
  }, [galleryFiles, timelineDate, filterType, searchQuery, sortBy]);

  // Getters for Timeline
  const getPxPerMinute = () => {
    if (timelineZoom === 60) return 0.8;
    if (timelineZoom === 30) return 1.5;
    if (timelineZoom === 15) return 3;
    if (timelineZoom === 10) return 4.5;
    if (timelineZoom === 5) return 9;
    if (timelineZoom === 1) return 30;
    return 4.5;
  };

  const pxPerMinute = getPxPerMinute();
  const trackWidth = 1440 * pxPerMinute;
  const halfContainerWidth = containerWidth / 2;

  const getTimelineDateLabel = () => {
    const today = getLocalDateString();
    const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
    if (timelineDate === today) return "Today";
    if (timelineDate === yesterday) return "Yesterday";
    const parts = timelineDate.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  const getTimelineTicks = () => {
    const ticks: any[] = [];
    let step = 60;
    if (timelineZoom === 30) step = 30;
    else if (timelineZoom === 15) step = 15;
    else if (timelineZoom === 10) step = 10;
    else if (timelineZoom === 5) step = 5;
    else if (timelineZoom === 1) step = 1;

    for (let m = 0; m <= 1440; m += step) {
      const hrs = Math.floor(m / 60);
      const mins = m % 60;
      const label = String(hrs).padStart(2, "0") + ":" + String(mins).padStart(2, "0");
      ticks.push({
        minutes: m,
        left: m * pxPerMinute,
        label: label,
        isMajor: m % 60 === 0,
      });
    }
    return ticks;
  };

  const getFootageBlocks = () => {
    return filteredFiles
      .filter((f) => !f.mimeType.includes("image/"))
      .map((file) => {
        const parsed = parseFileDateTime(file);
        return { file, parsed };
      })
      .filter((item) => item.parsed.dateStr === timelineDate)
      .map((item) => {
        const durationMin = activeCamera?.recordInterval || 5;
        const actualStartMinutes = item.parsed.startMinutes - durationMin;
        return {
          id: item.file.id,
          file: item.file,
          startMinutes: actualStartMinutes,
          left: actualStartMinutes * pxPerMinute,
          width: Math.max(12, durationMin * pxPerMinute),
        };
      });
  };

  const getSnapshotMarkers = () => {
    return filteredFiles
      .filter((f) => f.mimeType.includes("image/"))
      .map((file) => {
        const parsed = parseFileDateTime(file);
        return { file, parsed };
      })
      .filter((item) => item.parsed.dateStr === timelineDate)
      .map((item) => {
        return {
          id: item.file.id,
          file: item.file,
          startMinutes: item.parsed.startMinutes,
          left: item.parsed.startMinutes * pxPerMinute,
          timeLabel: item.parsed.timeLabel,
        };
      });
  };

  // Seek/Scroll timeline
  const adjustTimelineDate = (days: number) => {
    temporaryIgnoreTimeUpdate(1500);
    const parts = timelineDate.split("-");
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    date.setDate(date.getDate() + days);
    const dateStr = getLocalDateString(date);
    setTimelineDate(dateStr);

    setTimeout(() => {
      const dayFiles = galleryFiles.filter((f) => {
        return parseFileDateTime(f).dateStr === dateStr;
      });
      if (dayFiles.length > 0) {
        const lastFile = dayFiles[dayFiles.length - 1]; // sorted desc, so last is chronologically first
        const parsed = parseFileDateTime(lastFile);
        const durationMin = lastFile.mimeType.includes("image/") ? 0 : (activeCamera?.recordInterval || 5);
        const startMin = parsed.startMinutes - durationMin;
        setTimelineTime(startMin);
        syncTimelineScroll(startMin);
        playPlayback(lastFile);
      } else {
        setTimelineTime(720); // 12:00
        syncTimelineScroll(720);
      }
    }, 100);
  };

  const setTimelineZoomValue = (z: number) => {
    const currentTime = timelineTime;
    setTimelineZoom(z);
    setTimeout(() => {
      syncTimelineScroll(currentTime);
    }, 50);
  };

  const startTimelineDrag = (e: React.MouseEvent) => {
    setIsDraggingTimeline(true);
    dragStartXRef.current = e.pageX;
    const track = timelineTrackRef.current;
    if (track) {
      dragStartScrollLeftRef.current = track.scrollLeft;
    }
  };

  const handleTimelineDrag = (e: React.MouseEvent) => {
    if (!isDraggingTimeline) return;
    const dx = e.pageX - dragStartXRef.current;
    const track = timelineTrackRef.current;
    if (track) {
      track.scrollLeft = dragStartScrollLeftRef.current - dx;
    }
  };

  const endTimelineDrag = () => {
    if (isDraggingTimeline) {
      setIsDraggingTimeline(false);
      temporaryIgnoreTimeUpdate(1000);
      findAndPlayClosestFile();
    }
  };

  const handleTimelineScroll = () => {
    if (isDraggingTimeline || ignoreTimeUpdateRef.current) return;
    const track = timelineTrackRef.current;
    if (track) {
      const currentScrollMinutes = track.scrollLeft / pxPerMinute;
      setTimelineTime(currentScrollMinutes);
    }
  };

  const seekToMinutes = (min: number) => {
    temporaryIgnoreTimeUpdate(1000);
    setTimelineTime(min);
    syncTimelineScroll(min);
    findAndPlayClosestFile(min);
  };

  const syncTimelineScroll = (min = timelineTime) => {
    const track = timelineTrackRef.current;
    if (track) {
      ignoreTimeUpdateRef.current = true;
      track.scrollLeft = min * pxPerMinute;
      setTimeout(() => {
        ignoreTimeUpdateRef.current = false;
      }, 100);
    }
  };

  const findAndPlayClosestFile = (targetMin = timelineTime) => {
    // Find closest recording/snapshot file on the selected date
    const dayFiles = filteredFiles.filter((f) => {
      return parseFileDateTime(f).dateStr === timelineDate;
    });

    if (dayFiles.length === 0) return;

    let closestFile: GalleryFile | null = null;
    let minDiff = Infinity;

    dayFiles.forEach((file) => {
      const parsed = parseFileDateTime(file);
      const diff = Math.abs(parsed.startMinutes - targetMin);
      if (diff < minDiff) {
        minDiff = diff;
        closestFile = file;
      }
    });

    if (closestFile) {
      const parsed = parseFileDateTime(closestFile);
      const isImg = (closestFile as GalleryFile).mimeType.includes("image/");
      const durationMin = isImg ? 0 : (activeCamera?.recordInterval || 5);
      const fileStartMin = parsed.startMinutes - durationMin;

      // If playing video, seek video currentTime instead of reloading if it falls inside the file range
      const video = document.getElementById("cctv-player") as HTMLVideoElement;
      if (
        !isImg &&
        playbackFile &&
        playbackFile.id === (closestFile as GalleryFile).id &&
        video &&
        video.duration
      ) {
        const offsetSec = (targetMin - fileStartMin) * 60;
        if (offsetSec >= 0 && offsetSec <= video.duration) {
          video.currentTime = offsetSec;
          return;
        }
      }

      playPlayback(closestFile);
    }
  };

  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (isDraggingTimeline || ignoreTimeUpdateRef.current || !playbackFile) return;
    const video = e.currentTarget;
    const parsed = parseFileDateTime(playbackFile);
    const durationMin = activeCamera?.recordInterval || 5;
    const fileStartMinutes = parsed.startMinutes - durationMin;
    const currentMin = fileStartMinutes + video.currentTime / 60;
    setTimelineTime(currentMin);
    syncTimelineScroll(currentMin);
  };

  const handleVideoEnded = () => {
    if (activeMode !== "playback_video" || !playbackFile) return;

    // Filter and sort clips for the current date chronologically (oldest first)
    const clips = filteredFiles
      .filter((f) => !f.mimeType.includes("image/"))
      .map((file) => {
        const parsed = parseFileDateTime(file);
        return { file, parsed };
      })
      .filter((item) => item.parsed.dateStr === timelineDate)
      .sort((a, b) => new Date(a.file.createdAt).getTime() - new Date(b.file.createdAt).getTime());

    const currentIndex = clips.findIndex((item) => item.file.id === playbackFile.id);
    if (currentIndex !== -1 && currentIndex < clips.length - 1) {
      const nextFile = clips[currentIndex + 1].file;
      console.log("Automatically playing next clip:", nextFile.name);
      playPlayback(nextFile);
    }
  };

  const formatMinutesToTime = (totalMinutes: number) => {
    const totalSecs = Math.round(totalMinutes * 60);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return (
      String(hrs).padStart(2, "0") +
      ":" +
      String(mins).padStart(2, "0") +
      ":" +
      String(secs).padStart(2, "0")
    );
  };

  const timelineDateLabel = getTimelineDateLabel();
  const timelineTicks = getTimelineTicks();
  const footageBlocks = getFootageBlocks();
  const snapshotMarkers = getSnapshotMarkers();

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Inline styles for HUD and Command Center Aesthetic */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes radar-pulse {
              0% { transform: scale(0.95); opacity: 0.1; }
              50% { opacity: 0.3; }
              100% { transform: scale(2.2); opacity: 0; }
          }
          @keyframes sweep {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
          }
          .radar-grid {
              background-image: radial-gradient(circle, rgba(59, 130, 246, 0.12) 1px, transparent 1px),
                                linear-gradient(to right, rgba(59, 130, 246, 0.05) 1px, transparent 1px),
                                linear-gradient(to bottom, rgba(59, 130, 246, 0.05) 1px, transparent 1px);
              background-size: 60px 60px, 20px 20px, 20px 20px;
              background-position: center;
          }
          .radar-sweep {
              background: conic-gradient(from 0deg, rgba(59, 130, 246, 0.35) 0deg, rgba(59, 130, 246, 0.08) 45deg, transparent 90deg);
              animation: sweep 6s linear infinite;
              transform-origin: center;
          }
          .radar-ping {
              animation: radar-pulse 3s cubic-bezier(0.215, 0.610, 0.355, 1.0) infinite;
          }
          .beacon-pulse {
              animation: radar-pulse 2s cubic-bezier(0.215, 0.610, 0.355, 1.0) infinite;
          }
          .monitor-active-live {
              border: 2px solid rgba(239, 68, 68, 0.35) !important;
              box-shadow: 0 0 25px rgba(239, 68, 68, 0.15) !important;
          }
          .monitor-active-playback {
              border: 2px solid rgba(59, 130, 246, 0.35) !important;
              box-shadow: 0 0 25px rgba(59, 130, 246, 0.15) !important;
          }
          .scale-in {
              animation: modalScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          }
          @keyframes modalScaleIn {
              from { transform: scale(0.9) translateY(10px); opacity: 0; }
              to { transform: scale(1) translateY(0); opacity: 1; }
          }
          .no-scrollbar::-webkit-scrollbar {
              display: none;
          }
          .no-scrollbar {
              -ms-overflow-style: none;
              scrollbar-width: none;
          }
        ` }} />

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <i className="fa-solid fa-shield-halved text-blue-500 text-2xl"></i>
              <span>CCTV Command HUD</span>
            </h1>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
              Connect, capture, and archive automated snapshots and security feeds straight to your cloud gateway
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="h-10 px-5 rounded-xl font-bold text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transform cursor-pointer"
          >
            <i className="fa-solid fa-plus-circle text-sm"></i>
            <span>Register New Camera</span>
          </button>
        </div>



        {/* Collapsible Setup Guide */}
        <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-gradient-to-r from-blue-50/20 to-indigo-50/20 dark:from-blue-950/10 dark:to-indigo-950/10 p-4.5 shadow-sm transition-all duration-300">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setShowSetupGuide(!showSetupGuide)}
          >
            <div className="flex items-center gap-3">
              <div className="h-8.5 w-8.5 rounded-xl font-bold flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                <i className="fa-solid fa-circle-info text-sm"></i>
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span>CCTV & Streaming Setup Guide</span>
                  <span className="text-[9px] font-semibold px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full">
                    {showSetupGuide ? "Click to collapse" : "Click to view instructions"}
                  </span>
                </h3>
                <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                  Learn how to connect IP cameras, capture snapshots, and configure quotas.
                </p>
              </div>
            </div>
            <div className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition pr-1">
              <i className={`fa-solid fa-chevron-${showSetupGuide ? "up" : "down"} text-[10px]`}></i>
            </div>
          </div>
          
          {showSetupGuide && (
            <div className="pt-4 mt-4 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800/85 grid gap-4 md:grid-cols-3">
              <div className="space-y-1 bg-white/50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1 text-[11px]">
                  <span className="h-4.5 w-4.5 rounded bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center text-[9px] font-extrabold">1</span>
                  Browser Bridge Setup
                </h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  IP cameras output RTSP feeds which are not natively playable in web browsers. Use tools like FFmpeg or Go2RTC on your server to convert/transcode RTSP streams into browser-playable HLS (.m3u8) feeds.
                </p>
              </div>
              <div className="space-y-1 bg-white/50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1 text-[11px]">
                  <span className="h-4.5 w-4.5 rounded bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center text-[9px] font-extrabold">2</span>
                  Cron Snapping & Records
                </h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Set a Cron expression (e.g. <code>*/5 * * * *</code> for every 5 minutes) to take snapshots. Enable Continuous Stream Recording to automatically compile HLS stream segments into standard 1, 5, or 10-minute MP4 blocks.
                </p>
              </div>
              <div className="space-y-1 bg-white/50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1 text-[11px]">
                  <span className="h-4.5 w-4.5 rounded bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center text-[9px] font-extrabold">3</span>
                  Routing & Expiring
                </h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  Assign cameras to storage providers. Snapshots and recorded video clips will route automatically to the selected bucket/folder. The system automatically prunes files older than the retention days threshold.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Top Section: CCTV HUD Full-Width Console */}
        <div className="w-full space-y-6">
          {/* EMPTY MONITOR HUD */}
          {!activeCamera && (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm flex flex-col items-center justify-center min-h-[420px] relative overflow-hidden select-none">
              {/* Radar Visual Panel */}
              <div className="relative w-60 h-60 rounded-full border border-blue-500/20 dark:border-blue-500/30 flex items-center justify-center radar-grid shadow-inner">
                {/* Rotating Sweeper Line */}
                <div className="absolute inset-0 rounded-full radar-sweep pointer-events-none"></div>

                {/* HUD rings */}
                <div className="w-44 h-44 rounded-full border border-blue-500/10 dark:border-blue-500/20 flex items-center justify-center">
                  <div className="w-28 h-28 rounded-full border border-blue-500/10 dark:border-blue-500/20 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border border-blue-500/15 dark:border-blue-500/25"></div>
                  </div>
                </div>

                {/* Target point pulsing green */}
                <div className="absolute top-[28%] left-[64%] w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/40">
                  <span className="absolute -inset-1 rounded-full bg-emerald-400 opacity-75 radar-ping"></span>
                </div>

                {/* Crosshair lines */}
                <div className="absolute inset-y-0 left-1/2 w-[1px] bg-blue-500/10 dark:bg-blue-500/20 pointer-events-none"></div>
                <div className="absolute inset-x-0 top-1/2 h-[1px] bg-blue-500/10 dark:bg-blue-500/20 pointer-events-none"></div>
              </div>

              <div className="mt-6 text-center space-y-2 max-w-sm relative z-10">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-wider uppercase flex items-center justify-center gap-1.5">
                  <i className="fa-solid fa-radar text-blue-500 animate-pulse text-xs"></i>
                  Awaiting feed initialization
                </h3>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 leading-relaxed">
                  Secure stream monitor connection ready. Please select a Live Stream or Playback from the active deck to initialize the monitor panel.
                </p>
              </div>
            </div>
          )}

          {/* ACTIVE MONITOR HUD */}
          {activeCamera && (
            <div
              className={`rounded-3xl border bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4 transition-all duration-300 ${
                activeMode === "live"
                  ? "monitor-active-live"
                  : "monitor-active-playback"
              }`}
            >
              {/* HUD header panel */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  {activeMode === "live" && (
                    <span className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <h2 className="text-xs font-black tracking-wider uppercase text-slate-800 dark:text-slate-200">
                        Monitoring: {activeCamera.name} (Live)
                      </h2>
                    </span>
                  )}
                  {activeMode === "playback_video" && (
                    <span className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                      <h2 className="text-xs font-black tracking-wider uppercase text-slate-800 dark:text-slate-200">
                        Playback: {playbackFile ? playbackFile.name : ""}
                      </h2>
                    </span>
                  )}
                  {activeMode === "playback_image" && (
                    <span className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <h2 className="text-xs font-black tracking-wider uppercase text-slate-800 dark:text-slate-200">
                        Snapshot: {playbackFile ? playbackFile.name : ""}
                      </h2>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {activeMode !== "live" && (
                    <button
                      onClick={restoreLiveFeed}
                      className="text-[10px] font-extrabold text-blue-500 hover:text-blue-600 transition flex items-center gap-1 cursor-pointer"
                    >
                      <i className="fa-solid fa-circle-play text-blue-500"></i> Watch Live Feed
                    </button>
                  )}
                  <button
                    onClick={closeLiveView}
                    className="text-[10px] font-extrabold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition flex items-center gap-1 cursor-pointer"
                  >
                    <i className="fa-solid fa-xmark text-slate-400"></i> Close Monitor
                  </button>
                </div>
              </div>

              {/* HUD Monitor Screen Container */}
              <div className="relative aspect-video max-h-[460px] rounded-2xl bg-black overflow-hidden group shadow-inner border border-slate-900 mx-auto w-full">
                <div
                  className="w-full h-full"
                  style={{ display: activeMode === "live" || activeMode === "playback_video" ? "block" : "none" }}
                >
                  {activeMode === "live" && streamLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-6 text-center select-none">
                      <div className="relative flex h-12 w-12 items-center justify-center mb-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                        <i className="fa-solid fa-satellite-dish absolute text-blue-500 text-sm animate-pulse"></i>
                      </div>
                      <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider">Establishing Stream Bridge</h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-md font-semibold">
                        Repackaging RTSP stream packets to browser-compatible HLS segments...
                      </p>
                    </div>
                  ) : activeMode === "live" && streamError ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-6 text-center select-none">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-950/30 border border-red-500/20 text-red-500 mb-3 shadow-md">
                        <i className="fa-solid fa-triangle-exclamation text-xl"></i>
                      </div>
                      <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider text-red-400">Stream Connection Failed</h3>
                      <p className="text-xs text-red-400/80 mt-1 max-w-md font-semibold">
                        {streamError}
                      </p>
                      <button
                        onClick={() => activeCamera && startLiveMode(activeCamera)}
                        className="mt-4 px-4 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[10px] font-extrabold tracking-wider uppercase transition cursor-pointer"
                      >
                        Retry Connection
                      </button>
                    </div>
                  ) : (
                    <video
                      id="cctv-player"
                      ref={videoRef}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onEnded={handleVideoEnded}
                      controls
                      autoPlay
                      muted
                      className="w-full h-full object-contain"
                    ></video>
                  )}
                </div>
                {activeMode === "playback_image" && (
                  <div className="w-full h-full flex items-center justify-center bg-slate-950">
                    <img src={playbackUrl} className="max-w-full max-h-full object-contain" alt="CCTV Snapshot" />
                  </div>
                )}

                {/* Overlay Canvas Triggers */}
                {(activeMode === "live" || activeMode === "playback_video") && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-slate-950/85 p-2.5 rounded-xl border border-slate-800/80 z-10">
                    <button
                      type="button"
                      onClick={captureCanvasSnapshot}
                      className="text-[10px] text-white hover:text-blue-400 font-extrabold flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-900/50 transition cursor-pointer"
                    >
                      <i className="fa-solid fa-camera text-white"></i> Instant Frame Snap
                    </button>
                    {activeMode === "live" && (
                      <>
                        <span className="text-slate-800">|</span>
                        <button
                          type="button"
                          onClick={() => triggerManualRecord(activeCamera.id)}
                          disabled={recordingClip}
                          className="text-[10px] text-white hover:text-red-400 font-extrabold flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-900/50 transition disabled:opacity-50 cursor-pointer"
                        >
                          {!recordingClip ? (
                            <>
                              <i className="fa-solid fa-circle text-[8px] text-red-500 animate-pulse"></i> Record Clip
                            </>
                          ) : (
                            <span className="flex items-center gap-1">
                              <span className="animate-spin rounded-full h-2.5 w-2.5 border border-white border-t-transparent"></span>{" "}
                              Capturing...
                            </span>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* CCTV Playback Timeline Scrubber */}
              {activeMode !== "live" && (
                <div className="space-y-3 bg-slate-50 dark:bg-slate-950/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 mt-2 select-none">
                  {/* Timeline Date & Mode Header */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustTimelineDate(-1)}
                        className="h-7 w-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-chevron-left text-[10px]"></i>
                      </button>
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200 w-24 text-center">
                        {timelineDateLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustTimelineDate(1)}
                        className="h-7 w-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-chevron-right text-[10px]"></i>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">Zoom:</span>
                      <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
                        {[60, 30, 15, 10, 5, 1].map((z) => (
                          <button
                            key={z}
                            type="button"
                            onClick={() => setTimelineZoomValue(z)}
                            className={`px-2 py-0.5 text-[9px] border-r border-slate-200 dark:border-slate-800 last:border-0 transition cursor-pointer ${
                              timelineZoom === z
                                ? "bg-blue-500 text-white font-bold"
                                : "text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            {z}M
                          </button>
                        ))
                        }
                      </div>
                    </div>
                  </div>

                  {/* Active Time Display */}
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      Playback Time:{" "}
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-extrabold text-xs bg-slate-200/50 dark:bg-slate-900 px-2 py-0.5 rounded">
                        {formatMinutesToTime(timelineTime)}
                      </span>
                    </span>
                    {playbackFile ? (
                      <span
                        className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 dark:bg-emerald-950/20 px-2 py-0.5 rounded truncate max-w-[200px]"
                        title={playbackFile.name}
                      >
                        {playbackFile.name}
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold px-2 py-0.5">
                        Drag timeline to seek time
                      </span>
                    )}
                  </div>

                  {/* Timeline Scrubber Container */}
                  <div className="relative w-full h-16 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-inner select-none">
                    {/* Center playhead indicator line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-blue-500 z-20 pointer-events-none shadow-sm shadow-blue-500/50">
                      <div className="absolute -top-0.5 -left-[4px] h-2.5 w-2.5 rounded-full bg-blue-500"></div>
                    </div>

                    {/* Draggable track */}
                    <div
                      id="timeline-track"
                      ref={timelineTrackRef}
                      onScroll={handleTimelineScroll}
                      onMouseDown={startTimelineDrag}
                      onMouseMove={handleTimelineDrag}
                      onMouseUp={endTimelineDrag}
                      onMouseLeave={endTimelineDrag}
                      className="w-full h-full overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing relative flex items-center"
                    >
                      {/* Inner 24 hours width */}
                      <div
                        className="h-full relative flex items-center"
                        style={{
                          width: `${trackWidth}px`,
                          paddingLeft: `${halfContainerWidth}px`,
                          paddingRight: `${halfContainerWidth}px`,
                        }}
                      >
                        {/* Footage Blocks */}
                        {footageBlocks.map((block) => (
                          <div
                            key={block.id}
                            className="absolute top-1.5 bottom-6 rounded bg-gradient-to-b from-orange-400/40 to-orange-500/40 dark:from-orange-500/30 dark:to-orange-600/30 border border-orange-500/20 cursor-pointer hover:from-orange-400/50 hover:to-orange-500/50 transition-colors z-10"
                            style={{
                              left: `${block.left + halfContainerWidth}px`,
                              width: `${block.width}px`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              seekToMinutes(block.startMinutes);
                            }}
                            title="Recorded Segment"
                          ></div>
                        ))}

                        {/* Snapshot Markers */}
                        {snapshotMarkers.map((snap) => (
                          <div
                            key={snap.id}
                            className="absolute top-1.5 bottom-6 w-[3px] bg-emerald-500 dark:bg-emerald-400 rounded-full cursor-pointer hover:scale-x-150 transition-transform z-10"
                            style={{
                              left: `${snap.left + halfContainerWidth}px`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              seekToMinutes(snap.startMinutes);
                            }}
                            title={`Snapshot at ${snap.timeLabel}`}
                          ></div>
                        ))}

                        {/* Hour/Minute Ticks */}
                        {timelineTicks.map((tick) => (
                          <div
                            key={tick.minutes}
                            className="absolute bottom-0 flex flex-col items-center justify-end h-full pointer-events-none"
                            style={{
                              left: `${tick.left + halfContainerWidth}px`,
                              width: "60px",
                              transform: "translateX(-50%)",
                            }}
                          >
                            {(tick.isMajor || timelineZoom <= 15) && (
                              <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-0.5">
                                {tick.label}
                              </span>
                            )}
                            <div
                              className={`w-[1px] bg-slate-200 dark:bg-slate-800 ${
                                tick.isMajor ? "h-3" : "h-1.5"
                              }`}
                            ></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Section: Camera Deck and Historical Logs side-by-side */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: Camera Deck */}
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <i className="fa-solid fa-video text-blue-500"></i> Active Streams
                  </h2>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                    {cameras.length} cameras registered
                  </p>
                </div>
              </div>

              {/* Camera Deck Container */}
              <div className="space-y-3.5 max-h-[580px] overflow-y-auto pr-1 no-scrollbar">
                {cameras.length === 0 && (
                  <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No cameras registered.</p>
                    <button
                      onClick={openAddModal}
                      className="mt-2 text-[10px] text-blue-500 font-extrabold hover:text-blue-600 underline cursor-pointer"
                    >
                      Add First Camera Link
                    </button>
                  </div>
                )}

                {cameras.map((item) => {
                  const isSelected = activeCamera?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border-2 p-[15px] flex flex-col justify-between gap-3.5 transition hover:shadow-md hover:border-blue-500/20 group cursor-pointer ${
                        isSelected
                          ? "border-blue-500 dark:border-blue-600 bg-blue-500/[0.01]"
                          : "border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20"
                      }`}
                      onClick={() => {
                        if (activeMode === "live") {
                          startLiveMode(item);
                        } else {
                          startPlaybackMode(item);
                        }
                      }}
                    >
                      <div className="space-y-3">
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Active pulse */}
                            <div className="relative flex h-2.5 w-2.5 shrink-0">
                              <span className="beacon-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate text-xs font-black text-slate-700 dark:text-slate-200 group-hover:text-blue-500 transition">
                                {item.name}
                              </h3>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition duration-200">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(item);
                              }}
                              className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Edit Camera"
                            >
                              <i className="fa-solid fa-pen text-[10px]"></i>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCamera(item.id);
                              }}
                              className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Delete Camera"
                            >
                              <i className="fa-solid fa-trash-can text-[10px]"></i>
                            </button>
                          </div>
                        </div>

                        {/* HUD Details mini panel */}
                        <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/50 dark:border-slate-800 text-[10px] space-y-1 font-semibold text-slate-500 dark:text-slate-400">
                          <div className="flex items-center justify-between">
                            <span>Snapshot Cron:</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {item.scheduleCron || "Disabled"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Cloud Gateway:</span>
                            <span className="truncate max-w-[110px] text-slate-700 dark:text-slate-300">
                              {item.connectedAccountId
                                ? (storageAccounts.find((a) => a.id === item.connectedAccountId)?.displayName || "Account")
                                : "Routing Policy"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-900 mt-1.5">
                            <span>Last Sync:</span>
                            <span className="text-[9px] text-slate-600 dark:text-slate-300">
                              {item.lastCaptureAt ? formatDateTime(item.lastCaptureAt) : "Never captured"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Buttons */}
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startLiveMode(item);
                          }}
                          className={`flex-1 h-8.5 rounded-xl text-[10px] font-black transition flex items-center justify-center gap-1 shadow-sm active:scale-95 transform cursor-pointer ${
                            isSelected && activeMode === "live"
                              ? "bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/10"
                              : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          <i
                            className={`fa-solid fa-tower-broadcast text-[9px] ${
                              isSelected && activeMode === "live" ? "text-white" : "text-red-500 animate-pulse"
                            }`}
                          ></i>
                          <span>Live</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startPlaybackMode(item);
                          }}
                          className={`flex-1 h-8.5 rounded-xl text-[10px] font-black transition flex items-center justify-center gap-1 shadow-sm active:scale-95 transform cursor-pointer ${
                            isSelected && (activeMode === "playback_video" || activeMode === "playback_image")
                              ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/10"
                              : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          <i className="fa-solid fa-clock-rotate-left text-[9px]"></i>
                          <span>Playback</span>
                        </button>
                        {item.snapshotUrl && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerServerSnapshot(item.id);
                            }}
                            disabled={capturingSnapId === item.id}
                            className="px-2.5 h-8.5 rounded-xl text-[10px] font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition flex items-center justify-center disabled:opacity-50 cursor-pointer"
                            title="Snap Now"
                          >
                            {capturingSnapId !== item.id ? (
                              <i className="fa-solid fa-camera"></i>
                            ) : (
                              <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-500 border-t-transparent"></span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right Column: Historical Logs/Gallery */}
          <div className="lg:col-span-2 space-y-6">
            {!activeCamera && (
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm flex flex-col items-center justify-center min-h-[300px] text-center select-none">
                <i className="fa-solid fa-photo-film text-slate-300 dark:text-slate-700 text-4xl mb-3 animate-pulse"></i>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  Initialize a camera stream to display historical logs & captures.
                </p>
              </div>
            )}

            {activeCamera && (
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
                {/* Header with Title and Refreshes */}
                <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <i className="fa-solid fa-photo-film text-blue-500 text-xs"></i>
                        <span>Historical Captures & Recordings</span>
                      </h3>
                      <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                        Showing {filteredFiles.length} of {galleryFiles.length} files
                      </p>
                    </div>
                    <button
                      onClick={() => loadGallery(activeCamera.id)}
                      className="text-[10px] text-blue-500 font-black hover:text-blue-600 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                    >
                      <i className="fa-solid fa-rotate-right text-[9px]"></i> Refresh Logs
                    </button>
                  </div>

                  {/* Sorting, Filtering, and Search Toolbar */}
                  <div className="grid gap-2 sm:grid-cols-12 items-center">
                    {/* Search Input */}
                    <div className="relative sm:col-span-5">
                      <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-[10px]"></i>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search files by name..."
                        className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] font-semibold bg-slate-50 dark:bg-slate-950 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                      />
                    </div>

                    {/* Media Type Filter buttons */}
                    <div className="flex bg-slate-100 dark:bg-slate-950 rounded-lg p-0.5 border border-slate-200 dark:border-slate-800 sm:col-span-4 h-8 items-center justify-between">
                      {[
                        { value: "all", label: "All" },
                        { value: "video", label: "Videos" },
                        { value: "image", label: "Images" },
                      ].map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setFilterType(t.value as any)}
                          className={`flex-1 text-[9px] font-bold py-1 px-2 rounded-md transition cursor-pointer text-center ${
                            filterType === t.value
                              ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Sort dropdown */}
                    <div className="relative sm:col-span-3 h-8">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="w-full h-full px-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] font-bold bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="date_desc">Newest First</option>
                        <option value="date_asc">Oldest First</option>
                        <option value="size_desc">Largest Size</option>
                        <option value="size_asc">Smallest Size</option>
                      </select>
                    </div>
                  </div>
                </div>

                {loadingGallery ? (
                  <div className="py-12 flex justify-center items-center">
                    <span className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></span>
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 max-h-[580px] overflow-y-auto pr-1 no-scrollbar">
                    {galleryFiles.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
                        No recordings or snapshots captured for this camera yet.
                      </div>
                    ) : filteredFiles.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
                        No files match the applied search or filter criteria.
                      </div>
                    ) : (
                      filteredFiles.map((file) => {
                        const isImg = file.mimeType.includes("image/");
                        return (
                          <div
                            key={file.id}
                            className="relative group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2.5 text-center flex flex-col items-center justify-between gap-2 shadow-sm min-w-0 transition hover:shadow-md hover:border-blue-500/20"
                          >
                            <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-slate-200/50 dark:bg-slate-800 text-slate-500 shrink-0 group-hover:scale-105 transition-transform duration-200">
                              {isImg ? (
                                <i className="fa-solid fa-image text-lg text-emerald-500"></i>
                              ) : (
                                <i className="fa-solid fa-file-video text-lg text-red-500"></i>
                              )}
                            </div>
                            <div className="min-w-0 w-full text-center">
                              <p
                                className="truncate text-[10px] font-black text-slate-700 dark:text-slate-300"
                                title={file.name}
                              >
                                {file.name}
                              </p>
                              <p className="text-[8px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                                {formatBytes(file.sizeBytes)}
                              </p>
                            </div>
                            <div className="flex gap-1.5 items-center w-full justify-center">
                              <button
                                type="button"
                                onClick={() => playPlayback(file)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition cursor-pointer"
                                title="Preview/Play"
                              >
                                {isImg ? (
                                  <i className="fa-solid fa-eye text-[10px] text-slate-600 dark:text-slate-300"></i>
                                ) : (
                                  <i className="fa-solid fa-play text-[10px] text-slate-600 dark:text-slate-300"></i>
                                )}
                              </button>
                              <a
                                href={file.downloadUrl}
                                download
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition"
                                title="Download"
                              >
                                <i className="fa-solid fa-download text-[10px] text-slate-600 dark:text-slate-300"></i>
                              </a>
                              <button
                                onClick={() => deleteGalleryFile(file.id)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 text-red-500 hover:text-red-600 rounded-lg transition cursor-pointer"
                                title="Delete"
                              >
                                <i className="fa-solid fa-trash-can text-[10px] text-red-500 dark:text-red-400"></i>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Redesigned Add/Edit Camera Modal Dialog */}
      {isOpenFormModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex justify-center items-start sm:items-center p-4 sm:p-6">
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl transition-all scale-in my-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">
                  {isEdit ? "Edit Camera Configuration" : "Register New Camera Stream"}
                </h2>
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1">
                  Configure live RTSP/HLS stream decoders and automated cloud archives.
                </p>
              </div>
              <button
                onClick={cancelEdit}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition p-1 cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                isEdit ? updateCamera() : saveCamera();
              }}
              className="space-y-4"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Connection Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, connectionType: "standard" }))}
                    className={`flex-1 h-9 rounded-xl text-[10px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      form.connectionType === "standard"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <i className="fa-solid fa-link text-[9px]"></i> Standard HLS
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, connectionType: "onvif" }))}
                    className={`flex-1 h-9 rounded-xl text-[10px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      form.connectionType === "onvif"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <i className="fa-solid fa-network-wired text-[9px]"></i> ONVIF Camera
                  </button>
                </div>
              </div>

              {/* ONVIF Connection Settings */}
              {form.connectionType === "onvif" && (
                <div className="space-y-3 bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 mt-1">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2 mb-1.5 select-none">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-black shadow-sm shadow-blue-500/20">1</span>
                    <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                      Step 1: Import Settings via ONVIF
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-relaxed mb-1.5">
                    Enter the camera's local endpoint IP/URL and credentials. Click the query button to auto-fetch the live stream link below.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                      ONVIF Endpoint URL or IP Address
                    </label>
                    <input
                      type="text"
                      value={form.onvifUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, onvifUrl: e.target.value }))}
                      placeholder="e.g. 192.168.1.50 or http://192.168.1.50:80/onvif/device_service"
                      className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                        ONVIF Username (Optional)
                      </label>
                      <input
                        type="text"
                        value={form.onvifUsername}
                        onChange={(e) => setForm((prev) => ({ ...prev, onvifUsername: e.target.value }))}
                        placeholder="admin"
                        className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                        ONVIF Password (Optional)
                      </label>
                      <input
                        type="password"
                        value={form.onvifPassword}
                        onChange={(e) => setForm((prev) => ({ ...prev, onvifPassword: e.target.value }))}
                        placeholder="password"
                        className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={importOnvifDetails}
                    disabled={importingOnvif}
                    className="w-full h-8.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-400 text-blue-600 rounded-lg font-black text-[10px] transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {!importingOnvif ? (
                      <>
                        <i className="fa-solid fa-download text-[9px]"></i> Query & Import ONVIF Settings
                      </>
                    ) : (
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent"></span>
                    )}
                  </button>
                </div>
              )}

              {form.connectionType === "onvif" && (
                <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 mt-2 select-none">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-black shadow-sm shadow-blue-500/20">2</span>
                  <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                    Step 2: General & Stream Settings
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Camera Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="e.g. Front Door Camera"
                  className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {form.connectionType === "onvif" ? "Live Stream URL (Imported RTSP/HLS)" : "HLS Stream URL (.m3u8)"}
                </label>
                <input
                  type="text"
                  value={form.streamUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, streamUrl: e.target.value }))}
                  required
                  placeholder="e.g. https://example.com/live/cctv.m3u8"
                  className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                />
              </div>

              {form.connectionType === "standard" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    HTTP Snapshot URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={form.snapshotUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, snapshotUrl: e.target.value }))}
                    placeholder="e.g. http://192.168.1.50/snapshot.jpg"
                    className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  />
                </div>
              )}

              {/* Custom HTTP Request Headers for Camera Snapshot */}
              {form.snapshotUrl && form.connectionType === "standard" && (
                <div className="flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      HTTP Headers (For Snapshot URL)
                    </label>
                    <button
                      type="button"
                      onClick={addHeaderRow}
                      className="text-[9px] font-black text-blue-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer"
                    >
                      <i className="fa-solid fa-plus text-[8px]"></i> Add Header
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-normal">
                    Specify authentication headers if your camera requires authorization (e.g. JWT Token or Basic
                    credentials).
                  </p>

                  <div className="flex gap-2 text-[9px] font-extrabold text-blue-500 dark:text-blue-400 mt-1 select-none">
                    <span className="text-slate-400 dark:text-slate-600 font-normal">Presets:</span>
                    <button
                      type="button"
                      onClick={() => addHeaderPreset("jwt")}
                      className="hover:text-blue-600 dark:hover:text-blue-300 transition cursor-pointer"
                    >
                      + JWT Token (Bearer)
                    </button>
                    <span className="text-slate-200 dark:text-slate-800 font-normal">|</span>
                    <button
                      type="button"
                      onClick={() => addHeaderPreset("basic")}
                      className="hover:text-blue-600 dark:hover:text-blue-300 transition cursor-pointer"
                    >
                      + Basic Auth
                    </button>
                  </div>

                  <div className="space-y-2 mt-1">
                    {headersList.map((hdr, idx) => (
                      <div key={idx} className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          value={hdr.key}
                          onChange={(e) => updateHeaderRow(idx, "key", e.target.value)}
                          placeholder="Key (e.g. Authorization)"
                          className="flex-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[10px] font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                        />
                        <input
                          type="text"
                          value={hdr.value}
                          onChange={(e) => updateHeaderRow(idx, "value", e.target.value)}
                          placeholder="Value (e.g. Bearer xyz)"
                          className="flex-[1.5] h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[10px] font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeHeaderRow(idx)}
                          className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 transition cursor-pointer"
                        >
                          <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Schedule Snap (Cron)</label>
                  <input
                    type="text"
                    value={form.scheduleCron}
                    onChange={(e) => setForm((prev) => ({ ...prev, scheduleCron: e.target.value }))}
                    placeholder="e.g. */5 * * * * or empty"
                    className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Retention (Days)</label>
                  <input
                    type="number"
                    value={form.retentionDays}
                    onChange={(e) => setForm((prev) => ({ ...prev, retentionDays: Number(e.target.value) }))}
                    required
                    placeholder="7"
                    className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Destination Cloud Gateway</label>
                <select
                  value={form.connectedAccountId}
                  onChange={(e) => setForm((prev) => ({ ...prev, connectedAccountId: e.target.value }))}
                  required
                  className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                >
                  <option value="routing_policy">Dynamic (Upload Routing Policy)</option>
                  {storageAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.displayName} ({acc.provider.replace("_", " ")})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800 mt-2">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Continuous Stream Recording</p>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                    Continuously compile HLS video segment blocks into cloud storage.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={form.recordStream}
                  onChange={(e) => setForm((prev) => ({ ...prev, recordStream: e.target.checked }))}
                  className="w-4.5 h-4.5 border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950 accent-blue-500 cursor-pointer"
                />
              </div>

              {form.recordStream && (
                <div className="flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 animate-fade-in mt-1">
                  <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                    Recording Interval Block (Minutes)
                  </label>
                  <select
                    value={form.recordInterval}
                    onChange={(e) => setForm((prev) => ({ ...prev, recordInterval: Number(e.target.value) }))}
                    className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  >
                    <option value="1">1 Minute Blocks (Alert feeds)</option>
                    <option value="5">5 Minute Blocks (Standard feeds)</option>
                    <option value="10">10 Minute Blocks (General surveillance)</option>
                  </select>
                </div>
              )}

              <div className="flex items-center gap-3 justify-end pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
                {form.connectionType === "onvif" && (
                  <div className="mr-auto flex items-center gap-1.5 select-none animate-in fade-in duration-200">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-black shadow-sm shadow-blue-500/20">3</span>
                    <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">Step 3: Test & Save</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={testCameraConnection}
                  disabled={formLoading}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Test Connection
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white tracking-wide transition-colors cursor-pointer disabled:opacity-50"
                >
                  {formLoading ? (
                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent inline-block"></span>
                  ) : isEdit ? (
                    "Update Device"
                  ) : (
                    "Connect Device"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
