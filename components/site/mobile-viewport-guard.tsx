"use client"

import { useEffect } from "react"

/** Prevent multi-touch viewport gestures without blocking ordinary panel scrolling. */
export function MobileViewportGuard() {
  useEffect(() => {
    const stopGesture = (event: Event) => {
      if (event.cancelable) event.preventDefault()
    }
    const stopPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) stopGesture(event)
    }
    document.addEventListener("gesturestart", stopGesture, { passive: false })
    document.addEventListener("gesturechange", stopGesture, { passive: false })
    document.addEventListener("touchmove", stopPinch, { passive: false })
    return () => {
      document.removeEventListener("gesturestart", stopGesture)
      document.removeEventListener("gesturechange", stopGesture)
      document.removeEventListener("touchmove", stopPinch)
    }
  }, [])
  return null
}
