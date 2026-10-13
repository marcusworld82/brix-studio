import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"

export const EMAIL_COLORS = {
  page: "#0F1113",
  card: "#131517",
  border: "#23262A",
  text: "#F7F7F8",
  muted: "#979DAC",
  lime: "#006494",
  onLime: "#FFFFFF",
} as const

const font =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** Shared dark frame for every BRIX email. */
export function EmailFrame({
  preview,
  brand,
  children,
  footer,
}: {
  preview: string
  brand: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: EMAIL_COLORS.page,
          fontFamily: font,
          margin: 0,
          padding: "32px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: EMAIL_COLORS.card,
            border: `1px solid ${EMAIL_COLORS.border}`,
            borderRadius: 20,
            maxWidth: 520,
            padding: "36px 36px 28px",
          }}
        >
          <Section>
            <Text
              style={{
                color: EMAIL_COLORS.lime,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                margin: "0 0 28px",
                textTransform: "uppercase",
              }}
            >
              ✦ {brand}
            </Text>
          </Section>
          {children}
          <Hr
            style={{ borderColor: EMAIL_COLORS.border, margin: "28px 0 16px" }}
          />
          <Text
            style={{
              color: EMAIL_COLORS.muted,
              fontSize: 12,
              lineHeight: "18px",
              margin: 0,
            }}
          >
            {footer}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const heading = {
  color: EMAIL_COLORS.text,
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: "-0.04em",
  lineHeight: "32px",
  margin: "0 0 12px",
  textTransform: "uppercase" as const,
}

export const paragraph = {
  color: EMAIL_COLORS.muted,
  fontSize: 15,
  lineHeight: "24px",
  margin: "0 0 24px",
}

export const limeButton = {
  backgroundColor: EMAIL_COLORS.lime,
  borderRadius: 12,
  color: EMAIL_COLORS.onLime,
  display: "block",
  fontSize: 16,
  fontWeight: 700,
  padding: "16px 24px",
  textAlign: "center" as const,
  textDecoration: "none",
}
