import { Button, Text } from "@react-email/components"
import { EmailFrame, heading, paragraph, limeButton } from "./components"
export function AccountLinkEmail({
  url,
  kind,
}: {
  url: string
  kind: "signup" | "recovery"
}) {
  const title = kind === "signup" ? "Verify your email" : "Set your password"
  return (
    <EmailFrame
      brand="BRIX"
      preview={title}
      footer={<>If you did not request this, ignore this email.</>}
    >
      <Text style={heading}>{title}</Text>
      <Text style={paragraph}>
        {kind === "signup"
          ? "Confirm your email, then return to BRIX and log in with your email and password."
          : "Use this link to set a new password for your BRIX account."}
      </Text>
      <Button style={limeButton} href={url}>
        {title}
      </Button>
      <Text style={paragraph}>
        This link works once and expires in an hour.
      </Text>
    </EmailFrame>
  )
}
