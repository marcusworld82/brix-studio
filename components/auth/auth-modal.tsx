"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { useApp } from "@/components/providers/app-providers"
import { AuthShowcase } from "./auth-showcase"
import { LoginForm } from "./login-form"

/** The Login / Sign up modal (same component for both, like the site). */
export function AuthModal() {
  const { auth } = useApp()
  // A fresh inner component per opening starts from the requested mode.
  return (
    <AuthModalInner key={`${auth.open}-${auth.mode}-${auth.callbackUrl}`} />
  )
}

function AuthModalInner() {
  const { auth, closeAuth } = useApp()
  const [mode, setMode] = useState(auth.mode)

  return (
    <DialogPrimitive.Root
      open={auth.open}
      onOpenChange={(open) => !open && closeAuth()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/80 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="studio-backdrop fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-hairline duration-200 outline-none md:h-[min(776px,calc(100dvh-2rem))] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
          <DialogPrimitive.Title className="sr-only">
            {mode === "signup" ? "Sign up" : "Log in"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Sign in with a magic link sent to your email.
          </DialogPrimitive.Description>
          <div className="hidden w-1/2 p-3 md:block">
            <AuthShowcase />
          </div>
          <div className="relative flex flex-1 items-center justify-center overflow-y-auto p-8 md:p-14">
            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
            <div className="w-full max-w-[383px]">
              <LoginForm
                mode={mode}
                callbackUrl={auth.callbackUrl}
                reason={auth.reason}
                onModeChange={setMode}
              />
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
