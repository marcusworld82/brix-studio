import { redirect } from "next/navigation"
import { isSubscriptionEdition } from "@/lib/edition"
export default function SubscriptionPage() {
  redirect(
    isSubscriptionEdition()
      ? "/pricing"
      : process.env.NEXT_PUBLIC_SUBSCRIPTION_URL ||
          "https://brix-subscription.vercel.app/pricing"
  )
}
