import { Button, Text } from "@react-email/components"

import { EmailFrame, heading, limeButton, paragraph } from "./components"

export interface CreditsAddedEmailProps {
  brand: string
  credits: number
  balance: number
  amountLabel: string
  appUrl: string
}

export function CreditsAddedEmail({
  brand,
  credits,
  balance,
  amountLabel,
  appUrl,
}: CreditsAddedEmailProps) {
  return (
    <EmailFrame
      brand={brand}
      preview={`${credits.toLocaleString("en-US")} credits added to your ${brand} balance`}
      footer={
        <>
          Stripe sends your official receipt separately. Top-up credits never
          expire.
        </>
      }
    >
      <Text style={heading}>Credits added</Text>
      <Text style={paragraph}>
        Thanks for your purchase ({amountLabel}). We added{" "}
        <strong style={{ color: "#F7F7F8" }}>
          ✦ {credits.toLocaleString("en-US")} credits
        </strong>{" "}
        to your account. Your balance is now ✦ {balance.toLocaleString("en-US")}
        .
      </Text>
      <Button href={`${appUrl}/video`} style={limeButton}>
        Start generating
      </Button>
    </EmailFrame>
  )
}

export function creditsAddedText(props: CreditsAddedEmailProps): string {
  return [
    `Credits added to ${props.brand}`,
    "",
    `We added ${props.credits} credits (${props.amountLabel}). Balance: ${props.balance}.`,
    `Start generating: ${props.appUrl}/video`,
  ].join("\n")
}

CreditsAddedEmail.PreviewProps = {
  brand: "BRIX",
  credits: 2200,
  balance: 3150,
  amountLabel: "$20.00",
  appUrl: "https://vireo.studio",
} satisfies CreditsAddedEmailProps

export default CreditsAddedEmail
