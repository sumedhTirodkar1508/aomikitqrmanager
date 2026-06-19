"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, CameraOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { parseQrPayload } from "@/lib/qr-payload"

// BarcodeDetector is a native browser API not yet in TS lib.dom. Minimal types.
type DetectedBarcode = { rawValue: string }
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats(): Promise<string[]>
}

const SCAN_TIMEOUT_MS = 30_000

type ScanStatus = "starting" | "scanning" | "error" | "timeout"

export function QrScannerDialog({
  onToken,
  disabled,
}: {
  onToken: (token: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<ScanStatus>("starting")
  const [message, setMessage] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTokenRef = useRef<string | null>(null)
  const detectedRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastScanTimeRef = useRef<number>(0)

  // Keep the latest callback in a ref so `start` stays referentially stable and
  // the lifecycle effect does not restart the camera on every parent render.
  const onTokenRef = useRef(onToken)
  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (streamRef.current) {
      // Stop every track so the camera indicator turns off.
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const handleClose = useCallback(() => {
    stopCamera()
    setOpen(false)
  }, [stopCamera])

  const start = useCallback(async () => {
    setStatus("starting")
    setMessage(null)
    detectedRef.current = false

    // Secure-context / API availability checks.
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus("error")
      setMessage(
        "Camera access needs a secure connection (HTTPS) or localhost. Use manual entry."
      )
      return
    }

    const Detector = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
    ).BarcodeDetector

    let detector: BarcodeDetectorLike | null = null
    if (Detector) {
      try {
        const formats = await Detector.getSupportedFormats()
        if (formats.includes("qr_code")) {
          detector = new Detector({ formats: ["qr_code"] })
        }
      } catch {
        /* fallback to jsqr */
      }
    }

    if (!canvasRef.current && typeof document !== "undefined") {
      canvasRef.current = document.createElement("canvas")
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
    } catch (err) {
      setStatus("error")
      const name = err instanceof DOMException ? err.name : ""
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMessage("Camera permission was denied. Allow access or use manual entry.")
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setMessage("No camera was found on this device. Use manual entry.")
      } else {
        setMessage("Could not start the camera. Use manual entry.")
      }
      return
    }

    streamRef.current = stream
    const video = videoRef.current
    if (!video) {
      stopCamera()
      return
    }
    video.srcObject = stream
    try {
      await video.play()
    } catch {
      /* autoplay can reject silently; the frame loop still works */
    }

    setStatus("scanning")

    timeoutRef.current = setTimeout(() => {
      if (!detectedRef.current) {
        stopCamera()
        setStatus("timeout")
        setMessage("No QR code detected. Try again or use manual entry.")
      }
    }, SCAN_TIMEOUT_MS)

    const tick = async (timestamp: number) => {
      if (detectedRef.current || !streamRef.current || !videoRef.current) return
      const video = videoRef.current

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const codes = await detector.detect(video)
            for (const code of codes) {
              const result = parseQrPayload(code.rawValue)
              if (!result.ok) continue
              if (result.token === lastTokenRef.current) continue
              lastTokenRef.current = result.token
              detectedRef.current = true
              stopCamera()
              setOpen(false)
              onTokenRef.current(result.token)
              return
            }
          } else {
            if (timestamp - lastScanTimeRef.current >= 250) {
              lastScanTimeRef.current = timestamp
              const canvas = canvasRef.current
              if (canvas) {
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                  canvas.width = video.videoWidth
                  canvas.height = video.videoHeight
                }
                const ctx = canvas.getContext("2d", { willReadFrequently: true })
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                  const jsQRModule = await import("jsqr")
                  const jsQR = jsQRModule.default || jsQRModule
                  const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                  })
                  if (code) {
                    const result = parseQrPayload(code.data)
                    if (result.ok && result.token !== lastTokenRef.current) {
                      lastTokenRef.current = result.token
                      detectedRef.current = true
                      stopCamera()
                      setOpen(false)
                      onTokenRef.current(result.token)
                      return
                    }
                  }
                }
              }
            }
          }
        } catch {
          /* transient detect errors are ignored; keep scanning */
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopCamera])

  // Start when opened; always stop on close/unmount. The camera is an external
  // system, so `start` is kicked off from a deferred task rather than running
  // (and setting state) synchronously inside the effect body.
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => void start(), 0)
    return () => {
      clearTimeout(id)
      stopCamera()
    }
  }, [open, start, stopCamera])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : handleClose())}
    >
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Camera className="mr-2 size-4" /> Scan with camera
      </Button>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan QR code</DialogTitle>
          <DialogDescription>
            Point the camera at the printed AOMI Kit QR code.
          </DialogDescription>
        </DialogHeader>

        {status === "error" || status === "timeout" ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CameraOff className="size-6" />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
            <div className="flex gap-2">
              {status === "timeout" && (
                <Button onClick={() => void start()}>Try again</Button>
              )}
              <Button variant="outline" onClick={handleClose}>
                Use manual entry
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-3xl bg-black">
              {/* muted + playsInline are required for iOS autoplay */}
              <video
                ref={videoRef}
                className="aspect-square w-full object-cover"
                muted
                playsInline
                aria-label="Camera preview"
              />
              <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
            </div>
            <p className="text-center text-xs text-muted-foreground" aria-live="polite">
              {status === "starting" ? "Starting camera…" : "Scanning for a QR code…"}
            </p>
            <Button variant="outline" className="w-full" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
