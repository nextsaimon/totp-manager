"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import * as OTPAuth from "otpauth";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Image as ImageIcon,
  Check,
  Pencil,
  KeyRound,
  Camera,
  Zap,
  Sparkles,
  Search,
  PlusCircle,
  Link,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [secrets, setSecrets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState("");
  const [isCopied, setIsCopied] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLabelConfirmation, setDeleteLabelConfirmation] = useState("");
  const [editingTargetId, setEditingTargetId] = useState(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [manualLabel, setManualLabel] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [directUrl, setDirectUrl] = useState("");

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const [isTempGeneratorOpen, setIsTempGeneratorOpen] = useState(false);
  const [tempSecret, setTempSecret] = useState("");
  const [tempOtp, setTempOtp] = useState(null);
  const [tempTimeLeft, setTempTimeLeft] = useState(0);
  const [tempError, setTempError] = useState(null);
  const tempIntervalRef = useRef(null);

  const [visibleOtp, setVisibleOtp] = useState({ id: null, token: "••• •••" });
  const [otpTimeLeft, setOtpTimeLeft] = useState(0);
  const otpIntervalRef = useRef(null);

  const [togglingOtpId, setTogglingOtpId] = useState(null);
  const [copyingOtpId, setCopyingOtpId] = useState(null);

  const [visibleNotes, setVisibleNotes] = useState({});
  const [loadingNoteId, setLoadingNoteId] = useState(null);

  const videoRef = useRef(null);
  const processCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const scanningRef = useRef(false);
  const lastProcessRef = useRef(0);
  const pasteRef = useRef(null);
  const fileInputRef = useRef(null);
  const SCAN_INTERVAL_MS = 66;

  const autoLogoutTimerRef = useRef(null);
  const AUTO_LOGOUT_MINUTES = parseInt(
    process.env.NEXT_PUBLIC_AUTO_LOGOUT || "2",
    10
  );
  const AUTO_LOGOUT_MILLIS = AUTO_LOGOUT_MINUTES * 60 * 1000;

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setPasswordInput("");
    setSecrets([]);
    setDeleteTarget(null);
    setEditingTargetId(null);
    setPreview(null);
    setSearchQuery("");
    setVisibleNotes({});
    toast.info("Logged out due to inactivity.");
  }, []);

  const resetAutoLogoutTimer = useCallback(() => {
    if (autoLogoutTimerRef.current) {
      clearTimeout(autoLogoutTimerRef.current);
    }
    if (isAuthenticated) {
      autoLogoutTimerRef.current = setTimeout(logout, AUTO_LOGOUT_MILLIS);
    }
  }, [isAuthenticated, logout, AUTO_LOGOUT_MILLIS]);

  useEffect(() => {
    if (isAuthenticated) {
      resetAutoLogoutTimer();
    } else if (autoLogoutTimerRef.current) {
      clearTimeout(autoLogoutTimerRef.current);
    }

    const handleActivity = () => {
      if (isAuthenticated) resetAutoLogoutTimer();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("mousemove", handleActivity);
      window.addEventListener("keydown", handleActivity);
      window.addEventListener("click", handleActivity);
      window.addEventListener("scroll", handleActivity);
    }

    return () => {
      if (autoLogoutTimerRef.current) clearTimeout(autoLogoutTimerRef.current);
      if (typeof window !== "undefined") {
        window.removeEventListener("mousemove", handleActivity);
        window.removeEventListener("keydown", handleActivity);
        window.removeEventListener("click", handleActivity);
        window.removeEventListener("scroll", handleActivity);
      }
    };
  }, [isAuthenticated, resetAutoLogoutTimer]);

  useEffect(() => {
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.enumerateDevices
    ) {
      enumerateCameras();
      navigator.mediaDevices.addEventListener("devicechange", enumerateCameras);
    }
    return () => {
      stopCamera();
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        enumerateCameras
      );
      clearInterval(tempIntervalRef.current);
      clearInterval(otpIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (isCameraOpen) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [isCameraOpen, selectedDeviceId]);

  useEffect(() => {
    if (!isTempGeneratorOpen) {
      clearInterval(tempIntervalRef.current);
      setTempSecret("");
      setTempOtp(null);
      setTempError(null);
      setTempTimeLeft(0);
    }
  }, [isTempGeneratorOpen]);

  const handleGenerateTempCode = () => {
    clearInterval(tempIntervalRef.current);
    if (!tempSecret.trim()) {
      setTempError("Secret cannot be empty.");
      setTempOtp(null);
      return;
    }
    try {
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(tempSecret.trim().toUpperCase()),
      });
      const updateToken = () => {
        const token = totp.generate();
        const timeLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
        setTempOtp(token);
        setTempTimeLeft(timeLeft);
        setTempError(null);
      };
      updateToken();
      tempIntervalRef.current = setInterval(updateToken, 1000);
    } catch (e) {
      setTempError("Invalid Base32 secret key provided.");
      setTempOtp(null);
      setTempTimeLeft(0);
    }
  };

  const copyTempOtp = () => {
    if (!tempOtp) return;
    navigator.clipboard.writeText(tempOtp);
    toast.success("Temporary code copied to clipboard!");
  };

  const toggleOtp = async (id) => {
    clearInterval(otpIntervalRef.current);

    if (visibleOtp.id === id) {
      setVisibleOtp({ id: null, token: "••• •••" });
      setOtpTimeLeft(0);
      return;
    }

    setVisibleNotes({});
    setEditingTargetId(null);
    setEditingNoteContent("");

    setTogglingOtpId(id);
    try {
      const res = await fetch("/api/totp/generate", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to get token.");
      const { token } = await res.json();
      setVisibleOtp({ id, token });

      const updateTimer = () => {
        const timeLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
        setOtpTimeLeft(timeLeft);
        if (timeLeft <= 1) {
          clearInterval(otpIntervalRef.current);
          setVisibleOtp({ id: null, token: "••• •••" });
        }
      };
      updateTimer();
      otpIntervalRef.current = setInterval(updateTimer, 1000);
    } catch (error) {
      toast.error("Error", { description: error.message });
      setVisibleOtp({ id: null, token: "••• •••" });
      setOtpTimeLeft(0);
    } finally {
      setTogglingOtpId(null);
    }
  };

  async function enumerateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setCameraDevices(cams);
      if (cams.length > 0 && !selectedDeviceId) {
        const rear = cams.find((c) => /back|rear|environment/i.test(c.label));
        setSelectedDeviceId(rear ? rear.deviceId : cams[0].deviceId);
      }
    } catch (e) {
      console.error("Could not enumerate cameras:", e);
    }
  }

  async function startCamera() {
    try {
      stopCamera();
      if (!navigator.mediaDevices || !window.isSecureContext) {
        setCameraStatus("error: camera not supported");
        toast.error("Camera Not Supported", {
          description: "Camera access requires a secure (HTTPS) connection.",
        });
        setIsCameraOpen(false);
        return;
      }
      setCameraStatus("starting");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          facingMode: selectedDeviceId ? undefined : { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        trackRef.current = stream.getVideoTracks()[0];
        await videoRef.current.play();
        if (!processCanvasRef.current)
          processCanvasRef.current = document.createElement("canvas");
        scanningRef.current = true;
        setCameraStatus("scanning");
        requestAnimationFrame(scanLoop);
      }
    } catch (err) {
      setCameraStatus(`error: ${err.message}`);
      toast.error("Camera Error", {
        description: "Could not start camera. Check permissions.",
      });
      setIsCameraOpen(false);
    }
  }

  function stopCamera() {
    scanningRef.current = false;
    setTorchOn(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraStatus("idle");
  }

  function scanLoop() {
    if (!scanningRef.current || !videoRef.current) return;
    const video = videoRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const now = performance.now();
      if (now - lastProcessRef.current >= SCAN_INTERVAL_MS) {
        lastProcessRef.current = now;
        const pCanvas = processCanvasRef.current;
        if (pCanvas) {
          const vW = video.videoWidth;
          const vH = video.videoHeight;
          const targetProcW = Math.min(640, vW);
          const scale = targetProcW / vW;
          pCanvas.width = vW * scale;
          pCanvas.height = vH * scale;
          const pCtx = pCanvas.getContext("2d");
          pCtx.drawImage(video, 0, 0, pCanvas.width, pCanvas.height);
          const imageData = pCtx.getImageData(
            0,
            0,
            pCanvas.width,
            pCanvas.height
          );
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            scanningRef.current = false;
            stopCamera();
            setIsCameraOpen(false);
            submitOtpData({ url: code.data });
            return;
          }
        }
      }
    }
    if (scanningRef.current) requestAnimationFrame(scanLoop);
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (track?.getCapabilities().torch) {
      try {
        const newTorchState = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: newTorchState }] });
        setTorchOn(newTorchState);
      } catch (e) {
        toast.error("Failed to toggle flashlight.");
      }
    } else {
      toast.error("Flashlight not supported.");
    }
  }

  const getAuthHeaders = () => ({
    "Content-Type": "application/json",
    "X-App-Password": passwordInput,
  });

  const fetchSecrets = async (password) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/totp", {
        headers: { "X-App-Password": password },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ||
            (res.status === 401
              ? "Incorrect password."
              : "Failed to fetch secrets.")
        );
      }
      const data = await res.json();
      setSecrets(data);
      setIsAuthenticated(true);
    } catch (error) {
      toast.error("Authentication Failed", { description: error.message });
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
      setIsAuthenticating(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordInput) return toast.error("Password cannot be empty.");
    setIsAuthenticating(true);
    await fetchSecrets(passwordInput);
  };

  const submitOtpData = async (payload) => {
    try {
      const res = await fetch("/api/totp", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...payload, note }),
      });
      if (!res.ok)
        throw new Error((await res.json()).error || "Failed to add secret.");
      toast.success("Success!", { description: "New TOTP secret added." });
      setNote("");
      setPreview(null);
      setManualLabel("");
      setManualSecret("");
      setDirectUrl("");
      await fetchSecrets(passwordInput);
    } catch (error) {
      toast.error("Error Adding Secret", { description: error.message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddSecretFromFile = async () => {
    if (!preview) return toast.error("No image selected.");
    try {
      const otpUrl = await scanQrCode(preview);
      await submitOtpData({ url: otpUrl });
    } catch (error) {
      toast.error("Scan Failed", { description: error.message });
    }
  };

  const handleAddSecretManually = async () => {
    if (!manualLabel.trim()) {
      return toast.error("Label is required.");
    }
    if (!manualSecret.trim()) {
      return toast.error("Secret key is required.");
    }
    await submitOtpData({ label: manualLabel, secret: manualSecret });
  };

  const handleAddSecretFromUrl = async () => {
    if (!directUrl.trim().startsWith("otpauth://")) {
      return toast.error("Invalid URL", {
        description: "Please provide a valid otpauth:// URL.",
      });
    }
    await submitOtpData({ url: directUrl });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch("/api/totp", {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: deleteTarget._id,
          label: deleteLabelConfirmation,
        }),
      });
      if (!res.ok)
        throw new Error((await res.json()).error || "Failed to delete.");
      toast.success("Deleted", {
        description: `Secret for "${deleteTarget.label}" removed.`,
      });
      await fetchSecrets(passwordInput);
    } catch (error) {
      toast.error("Error", { description: error.message });
    } finally {
      setDeleteTarget(null);
      setDeleteLabelConfirmation("");
    }
  };

  const handleSaveNote = async (id) => {
    try {
      const res = await fetch("/api/totp", {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ id, note: editingNoteContent }),
      });
      if (!res.ok) throw new Error("Failed to update note.");
      toast.success("Note Updated");
      setVisibleNotes({ [id]: editingNoteContent });
      await fetchSecrets(passwordInput);
      handleCancelEdit();
    } catch (error) {
      toast.error("Error", { description: error.message });
    }
  };

  const copyOtp = async (id) => {
    setCopyingOtpId(id);
    try {
      const res = await fetch("/api/totp/generate", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to copy token.");
      const { token } = await res.json();
      navigator.clipboard.writeText(token);
      setIsCopied(id);
      toast("OTP copied to clipboard!");
      setTimeout(() => setIsCopied(null), 2000);
    } catch (error) {
      toast.error("Error", { description: error.message });
    } finally {
      setCopyingOtpId(null);
    }
  };

  const handleToggleNoteVisibility = async (id) => {
    if (visibleNotes.hasOwnProperty(id)) {
      setVisibleNotes({});
      return;
    }

    setVisibleOtp({ id: null, token: "••• •••" });
    setOtpTimeLeft(0);
    clearInterval(otpIntervalRef.current);
    setEditingTargetId(null);
    setEditingNoteContent("");

    setLoadingNoteId(id);
    try {
      const res = await fetch(`/api/totp?id=${id}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch note.");
      const { note } = await res.json();
      setVisibleNotes({ [id]: note });
    } catch (error) {
      toast.error("Error", { description: error.message });
      setVisibleNotes({});
    } finally {
      setLoadingNoteId(null);
    }
  };

  const handleEditClick = async (secret) => {
    const id = secret._id;

    if (editingTargetId === id) return;

    setVisibleOtp({ id: null, token: "••• •••" });
    setOtpTimeLeft(0);
    clearInterval(otpIntervalRef.current);
    setVisibleNotes({});

    if (secret.hasNote) {
      setLoadingNoteId(id);
      try {
        const res = await fetch(`/api/totp?id=${id}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error("Failed to fetch note for editing.");
        const { note } = await res.json();
        setEditingNoteContent(note || "");
      } catch (error) {
        toast.error("Error", { description: error.message });
        setEditingNoteContent("");
      } finally {
        setLoadingNoteId(null);
      }
    } else {
      setEditingNoteContent("");
    }
    setEditingTargetId(id);
  };

  const handleCancelEdit = () => {
    setEditingTargetId(null);
    setEditingNoteContent("");
  };

  const scanQrCode = (imageSrc) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) resolve(code.data);
        else reject("No QR code found in the image.");
      };
      img.onerror = () => reject("Failed to load image.");
    });

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const handlePaste = (e) => {
    const file = Array.from(e.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();
    if (file) setPreview(URL.createObjectURL(file));
  };

  const filteredSecrets = secrets.filter(
    (item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (visibleNotes[item._id] &&
        visibleNotes[item._id]
          .toLowerCase()
          .includes(searchQuery.toLowerCase()))
  );

  const SecretCardSkeleton = () => (
    <Card className="flex flex-col">
      <CardHeader className="flex-row justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-8" />
      </CardHeader>
      <CardFooter className="mt-auto">
        <div className="bg-muted w-full p-3 rounded-lg flex justify-between items-center">
          <Skeleton className="h-8 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </CardFooter>
    </Card>
  );

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Enter the password to access your secrets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isAuthenticating}
              >
                {isAuthenticating ? (
                  "Unlocking..."
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" /> Unlock
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-4 sm:p-6">
      <div className="w-full max-w-6xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">TOTP Secret Manager</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsTempGeneratorOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Add New Secret</CardTitle>
                <CardDescription>
                  Choose a method to add a new secret.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="scan" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="scan">Scan/Upload</TabsTrigger>
                    <TabsTrigger value="manual">Manual</TabsTrigger>
                    <TabsTrigger value="url">URL</TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="scan"
                    className="flex flex-col gap-4 pt-4"
                  >
                    <Button
                      variant="outline"
                      onClick={() => setIsCameraOpen(true)}
                    >
                      <Camera className="mr-2 h-4 w-4" /> Scan with Camera
                    </Button>
                    <div className="text-center text-sm text-muted-foreground">
                      OR
                    </div>
                    <div>
                      <Label htmlFor="qr-upload">Upload from file</Label>
                      <Input
                        ref={fileInputRef}
                        id="qr-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="mt-2"
                      />
                    </div>
                    <div
                      ref={pasteRef}
                      tabIndex={0}
                      onPaste={handlePaste}
                      className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground cursor-pointer hover:border-primary focus:border-primary outline-none"
                    >
                      Click and press <b>Ctrl + V</b> to paste
                    </div>
                    {preview && (
                      <div className="mt-2 space-y-2">
                        <Label>Image Preview</Label>
                        <div className="flex justify-center">
                          <img
                            src={preview}
                            alt="QR preview"
                            className="rounded-lg border max-h-40"
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="note-scan">Note (optional)</Label>
                      <Textarea
                        id="note-scan"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a descriptive note..."
                        className="mt-2"
                      />
                    </div>
                    <Button
                      onClick={handleAddSecretFromFile}
                      disabled={!preview}
                      className="w-full mt-2"
                    >
                      <ImageIcon className="mr-2 h-4 w-4" /> Add from Image
                    </Button>
                  </TabsContent>
                  <TabsContent value="manual" className="space-y-4 pt-4">
                    <div>
                      <Label htmlFor="manual-label">Label</Label>
                      <Input
                        id="manual-label"
                        value={manualLabel}
                        onChange={(e) => setManualLabel(e.target.value)}
                        placeholder="e.g., Google: user@example.com"
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="manual-secret">Secret Key (Base32)</Label>
                      <Textarea
                        id="manual-secret"
                        value={manualSecret}
                        onChange={(e) => setManualSecret(e.target.value)}
                        placeholder="Paste your Base32 secret here"
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="note-manual">Note (optional)</Label>
                      <Textarea
                        id="note-manual"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a descriptive note..."
                        className="mt-2"
                      />
                    </div>
                    <Button
                      onClick={handleAddSecretManually}
                      className="w-full"
                    >
                      <PlusCircle className="mr-2 h-4 w-4" /> Add Secret
                      Manually
                    </Button>
                  </TabsContent>
                  <TabsContent value="url" className="space-y-4 pt-4">
                    <div>
                      <Label htmlFor="direct-url">TOTP URL</Label>
                      <Textarea
                        id="direct-url"
                        value={directUrl}
                        onChange={(e) => setDirectUrl(e.target.value)}
                        placeholder="otpauth://totp/..."
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="note-url">Note (optional)</Label>
                      <Textarea
                        id="note-url"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a descriptive note..."
                        className="mt-2"
                      />
                    </div>
                    <Button onClick={handleAddSecretFromUrl} className="w-full">
                      <Link className="mr-2 h-4 w-4" /> Add from URL
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2">
            {isLoading ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <SecretCardSkeleton />
                <SecretCardSkeleton />
              </div>
            ) : secrets.length > 0 ? (
              <>
                <div className="relative mb-6">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search by label or visible note..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {filteredSecrets.length > 0 ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {filteredSecrets.map((item) => (
                      <Card key={item._id} className="flex flex-col">
                        <CardHeader className="flex-row justify-between items-start gap-2">
                          <div className="space-y-2 grow overflow-hidden">
                            <CardTitle className="truncate" title={item.label}>
                              {item.label}
                            </CardTitle>
                            {editingTargetId === item._id ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editingNoteContent}
                                  onChange={(e) =>
                                    setEditingNoteContent(e.target.value)
                                  }
                                  className="text-sm h-24"
                                  autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCancelEdit}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveNote(item._id)}
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2 group">
                                <div className="grow pr-2 min-w-0">
                                  {visibleNotes.hasOwnProperty(item._id) ? (
                                    <CardDescription
                                      className="whitespace-pre-wrap"
                                      title={visibleNotes[item._id]}
                                    >
                                      {visibleNotes[item._id] || (
                                        <span className="italic text-muted-foreground">
                                          Empty Note
                                        </span>
                                      )}
                                    </CardDescription>
                                  ) : (
                                    <CardDescription className="italic text-muted-foreground">
                                      {item.hasNote ? "Note hidden" : "No note"}
                                    </CardDescription>
                                  )}
                                </div>

                                <div className="flex items-center shrink-0">
                                  {item.hasNote && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() =>
                                        handleToggleNoteVisibility(item._id)
                                      }
                                      disabled={loadingNoteId === item._id}
                                      title={
                                        visibleNotes.hasOwnProperty(item._id)
                                          ? "Hide note"
                                          : "Show note"
                                      }
                                    >
                                      {loadingNoteId === item._id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : visibleNotes.hasOwnProperty(
                                          item._id
                                        ) ? (
                                        <EyeOff className="h-3 w-3" />
                                      ) : (
                                        <Eye className="h-3 w-3" />
                                      )}
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleEditClick(item)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </CardHeader>
                        <CardFooter className="mt-auto">
                          <div className="w-full space-y-2">
                            <div className="bg-muted w-full p-3 rounded-lg flex justify-between items-center">
                              <span className="text-2xl font-mono tracking-wider">
                                {visibleOtp.id === item._id
                                  ? visibleOtp.token
                                  : "••• •••"}
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => toggleOtp(item._id)}
                                  disabled={
                                    togglingOtpId === item._id ||
                                    copyingOtpId === item._id
                                  }
                                >
                                  {togglingOtpId === item._id ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                  ) : (
                                    <Eye className="h-5 w-5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => copyOtp(item._id)}
                                  disabled={
                                    togglingOtpId === item._id ||
                                    copyingOtpId === item._id
                                  }
                                >
                                  {isCopied === item._id ? (
                                    <Check className="h-5 w-5 text-green-500" />
                                  ) : copyingOtpId === item._id ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                  ) : (
                                    <Copy className="h-5 w-5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            {visibleOtp.id === item._id && (
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={(otpTimeLeft / 30) * 100}
                                  className="h-2"
                                />
                                <span className="text-xs text-muted-foreground">
                                  {otpTimeLeft}s
                                </span>
                              </div>
                            )}
                          </div>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground mt-16">
                    <h3 className="text-lg font-semibold">
                      No Matching Secrets
                    </h3>
                    <p>
                      Your search for "{searchQuery}" did not return any
                      results.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-muted-foreground mt-16">
                <h3 className="text-lg font-semibold">No secrets found</h3>
                <p>Add a new secret using the form to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteLabelConfirmation("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              TOTP secret for <br />
              <strong className="text-foreground">{deleteTarget?.label}</strong>
              <br />
              <br />
              To confirm, please type the label below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="delete-confirm" className="sr-only">
              Confirm Label
            </Label>
            <Input
              id="delete-confirm"
              value={deleteLabelConfirmation}
              onChange={(e) => setDeleteLabelConfirmation(e.target.value)}
              placeholder={deleteTarget?.label}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteLabelConfirmation !== deleteTarget?.label}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={isCameraOpen} onOpenChange={setIsCameraOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
            <DialogDescription>
              Point your camera at a QR code.
            </DialogDescription>
          </DialogHeader>
          <div className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <select
              className="border rounded-md px-2 py-1 text-sm bg-background"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
            >
              {cameraDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.substring(0, 6)}`}
                </option>
              ))}
            </select>
            <Button variant="outline" size="icon" onClick={toggleTorch}>
              <Zap className={`h-4 w-4 ${torchOn ? "fill-current" : ""}`} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Status: {cameraStatus}
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={isTempGeneratorOpen} onOpenChange={setIsTempGeneratorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Temporary Code Generator</DialogTitle>
            <DialogDescription>
              Generate a one-time code without saving the secret.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="temp-secret">TOTP Secret Key (Base32)</Label>
              <Textarea
                id="temp-secret"
                value={tempSecret}
                onChange={(e) => setTempSecret(e.target.value)}
                placeholder="Paste your Base32 secret here"
                className="mt-2"
              />
            </div>
            {(tempOtp || tempError) && (
              <>
                {tempError && (
                  <p className="text-sm text-destructive">{tempError}</p>
                )}
                {tempOtp && (
                  <div className="w-full space-y-2">
                    <div className="bg-muted w-full p-3 rounded-lg flex justify-between items-center">
                      <span className="text-2xl font-mono tracking-wider">
                        {tempOtp}
                      </span>
                      <Button variant="ghost" size="icon" onClick={copyTempOtp}>
                        <Copy className="h-5 w-5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={(tempTimeLeft / 30) * 100}
                        className="h-2"
                      />
                      <span className="text-xs text-muted-foreground">
                        {tempTimeLeft}s
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleGenerateTempCode} className="w-full">
              Generate Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
