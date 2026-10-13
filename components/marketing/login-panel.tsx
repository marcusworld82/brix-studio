"use client"

import { useState } from "react"

import { LoginForm } from "@/components/auth/login-form"

/** Full-page sign-in: the modal's form with its own login / sign-up switch. */
export function LoginPanel({
  initialMode,
  callbackUrl,
  reason,
  notice,
}: {
  initialMode: "login" | "signup"
  callbackUrl: string
  reason?: string
  notice?: string
}) {
  const [mode, setMode] = useState(initialMode)
  return (
    <div className="flex w-full flex-col gap-5">
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-lime/30 bg-lime/10 p-3 text-sm"
        >
          {notice}
        </p>
      ) : null}
      <LoginForm
        mode={mode}
        callbackUrl={callbackUrl}
        reason={reason}
        onModeChange={setMode}
      />
    </div>
  )
}
