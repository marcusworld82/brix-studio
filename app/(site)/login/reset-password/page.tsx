import type { Metadata } from "next"
import Link from "next/link"
import { recoveryTokenSchema } from "@/lib/auth/password-schema"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
export const metadata: Metadata = {
  title: "Set your password",
  robots: { index: false },
}
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const token = (await searchParams).token_hash
  return (
    <div className="studio-backdrop mx-auto my-12 w-full max-w-lg rounded-3xl border border-hairline p-8">
      {token && recoveryTokenSchema.safeParse(token).success ? (
        <ResetPasswordForm tokenHash={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl">This reset link is invalid</h1>
          <Link href="/login" className="text-lime underline">
            Request a fresh reset link
          </Link>
        </div>
      )}
    </div>
  )
}
