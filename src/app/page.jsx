"use client";
import { useState, useRef, useEffect } from "react";
import jsQR from "jsqr";
import * as OTPAuth from "otpauth";
import { toast } from "sonner";
import {
  Eye,
  Copy,
  Trash2,
  Image as ImageIcon,
  Check,
  Pencil,
  KeyRound,
  Camera,
  Zap,
  Sparkles,
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

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const processCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const scanningRef = useRef(false);
  const lastProcessRef = useRef(0);
  const pasteRef = useRef(null);
  const fileInputRef = useRef(null);
  const SCAN_INTERVAL_MS = 66; // ~15 FPS processing

  useEffect(() => {
    // Only attempt to enumerate devices and attach listeners when running in
    // a browser environment that exposes navigator.mediaDevices. This avoids
    // errors during SSR or in environments without camera support.
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.enumerateDevices === "function"
    ) {
      enumerateCameras();
      try {
        navigator.mediaDevices.addEventListener(
          "devicechange",
          enumerateCameras
        );
      } catch (e) {
        // some environments may not support addEventListener on mediaDevices
      }
    }

    return () => {
      stopCamera();
      try {
        navigator?.mediaDevices?.removeEventListener?.(
          "devicechange",
          enumerateCameras
        );
      } catch (e) {
        // ignore
      }
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
    }
  };

  async function enumerateCameras() {
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.enumerateDevices !== "function"
      ) {
        // Not running in a browser or mediaDevices not available.
        setCameraDevices([]);
        return;
      }
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
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        !window.isSecureContext
      ) {
        // No mediaDevices API available — likely not a browser or secure context.
        setCameraStatus("error: camera not supported");
        toast.error("Camera Not Supported", {
          description:
            "Camera access is only available on secure (HTTPS) connections or localhost.",
        });
        setIsCameraOpen(false);
        return;
      }
      setCameraStatus("starting");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          facingMode: selectedDeviceId ? undefined : { ideal: "environment" },
          // Lower default resolution and request a reasonable frameRate to
          // reduce CPU usage while keeping the camera responsive.
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        trackRef.current = stream.getVideoTracks()[0];
        await videoRef.current.play();
        // create a small offscreen canvas for processing (downscaled frames)
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
      // Throttle heavy processing (jsQR) to a target rate (SCAN_INTERVAL_MS)
      const now = performance.now();
      if (now - lastProcessRef.current >= SCAN_INTERVAL_MS) {
        lastProcessRef.current = now;
        const pCanvas = processCanvasRef.current;
        if (pCanvas) {
          const vW = video.videoWidth || video.clientWidth || 320;
          const vH = video.videoHeight || video.clientHeight || 240;
          // Target a smaller processing width to reduce pixels (maintain aspect)
          const targetProcW = Math.min(640, vW);
          const scale = targetProcW / vW;
          const pw = Math.max(160, Math.floor(vW * scale));
          const ph = Math.max(120, Math.floor(vH * scale));
          if (pCanvas.width !== pw) pCanvas.width = pw;
          if (pCanvas.height !== ph) pCanvas.height = ph;
          const pCtx = pCanvas.getContext("2d");
          try {
            pCtx.drawImage(video, 0, 0, pw, ph);
            const imageData = pCtx.getImageData(0, 0, pw, ph);
            const code = jsQR(imageData.data, pw, ph, {
              inversionAttempts: "dontInvert",
            });
            if (code && code.data) {
              scanningRef.current = false;
              stopCamera();
              setIsCameraOpen(false);
              submitOtpUrl(code.data);
              return;
            }
          } catch (e) {
            // getImageData or draw errors can occur on some devices; ignore and continue
          }
        }
      }
    }
    if (scanningRef.current) requestAnimationFrame(scanLoop);
  }
  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return toast.error("Camera not active");
    const capabilities = track.getCapabilities?.();
    if (!capabilities || !capabilities.torch)
      return toast.error("Flashlight not supported.");
    const newTorchState = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: newTorchState }] });
      setTorchOn(newTorchState);
    } catch (e) {
      toast.error("Failed to toggle flashlight.");
    }
  }
  const getAuthHeaders = () => ({
    "Content-Type": "application/json",
    "X-App-Password": passwordInput,
  });
  const fetchSecrets = async (password) => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/totp", {
        headers: { "X-App-Password": password },
      });
      if (!res.ok) {
        if (res.status === 429) {
          const data = await res.json();
          throw new Error(data.error || "Too many attempts.");
        }
        if (res.status === 401) throw new Error("Incorrect password.");
        throw new Error("Failed to fetch secrets.");
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
  const submitOtpUrl = async (url) => {
    try {
      const res = await fetch("/api/totp", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ url, note }),
      });
      if (!res.ok)
        throw new Error((await res.json()).error || "Failed to add secret.");
      toast.success("Success!", { description: "New TOTP secret added." });
      setNote("");
      setPreview(null);
      await fetchSecrets(passwordInput);
    } catch (error) {
      toast.error("Error Adding Secret", { description: error.message });
      setPreview(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const handleAddSecretFromFile = async () => {
    if (!preview)
      return toast.error("No Image", {
        description: "Please upload or paste an image.",
      });
    try {
      const otpUrl = await scanQrCode(preview);
      await submitOtpUrl(otpUrl);
    } catch (error) {
      toast.error("Scan Failed", { description: error.message });
    }
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
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete secret.");
      }
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
      handleCancelEdit();
      await fetchSecrets(passwordInput);
    } catch (error) {
      toast.error("Error", { description: error.message });
    }
  };
  const copyOtp = async (id) => {
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
    }
  };
  const handleEditClick = (secret) => {
    setEditingTargetId(secret._id);
    setEditingNoteContent(secret.note || "");
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
        if (code && code.data) resolve(code.data);
        else reject("No QR code found.");
      };
      img.onerror = () => reject("Failed to load image.");
    });
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
    else setPreview(null);
  };
  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (blob) setPreview(URL.createObjectURL(blob));
      }
    }
  };
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
              <CardContent className="flex flex-col gap-4">
                <Button variant="outline" onClick={() => setIsCameraOpen(true)}>
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
                <div className="text-center text-sm text-muted-foreground">
                  OR
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
                  <Label htmlFor="note">Note (optional)</Label>
                  <Textarea
                    id="note"
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
              <div className="grid sm:grid-cols-2 gap-4">
                {secrets.map((item) => (
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
                            <CardDescription
                              className="whitespace-pre-wrap grow"
                              title={item.note}
                            >
                              {item.note || "No note"}
                            </CardDescription>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleEditClick(item)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
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
                            >
                              <Eye className="h-5 w-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyOtp(item._id)}
                            >
                              {isCopied === item._id ? (
                                <Check className="h-5 w-5 text-green-500" />
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
