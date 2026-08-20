// src/emails/components/OrderStatusTracker.tsx
import { Row, Column, Section, Text, Link } from "@react-email/components"
import * as React from "react"

const DARK = "#0F0F0F"
const RED = "#DC2626"
const BORDER = "#E6E1D8"
const MUTED = "#A8A29A"

type StepDef = {
  label: string
  char: string
}

const STEPS: StepDef[] = [
  { label: "Confirmado", char: "✓" },
  { label: "En camino", char: "▶" },
  { label: "Entregado", char: "✓" },
]

const FAILED_CHAR = "✕"

type Props = {
  currentStep: 0 | 1 | 2
  variant?: "default" | "failed"
  trackingUrl?: string
}

export function OrderStatusTracker({
  currentStep,
  variant = "default",
  trackingUrl,
}: Props) {
  const isFailed = variant === "failed"

  return (
    <Section style={{ margin: "20px 0" }}>
      <table
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{
          backgroundColor: "#FAF8F5",
          border: "1px solid #E6E1D8",
          borderRadius: 16,
          padding: "20px 16px",
        }}
      >
        <tr>
          {STEPS.map((step, i) => {
            const active = i === currentStep
            const completed = i < currentStep
            const isCurrentOrDone = active || completed
            const showFailed = isFailed && i === 2

            let bg: string
            let border: string
            let charColor: string
            let labelColor: string
            let fontWeight: number = 500

            if (showFailed) {
              bg = RED
              border = RED
              charColor = "#ffffff"
              labelColor = RED
              fontWeight = 700
            } else if (isCurrentOrDone) {
              bg = DARK
              border = DARK
              charColor = "#ffffff"
              labelColor = DARK
              fontWeight = 700
            } else {
              bg = "#ffffff"
              border = BORDER
              charColor = MUTED
              labelColor = MUTED
              fontWeight = 500
            }

            const displayChar = showFailed ? FAILED_CHAR : step.char

            return (
              <td key={i} width="33.33%" align="center" style={{ verticalAlign: "top" }}>
                <table cellPadding={0} cellSpacing={0} style={{ margin: "0 auto 8px" }}>
                  <tr>
                    <td
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: bg,
                        border: `1px solid ${border}`,
                        textAlign: "center" as const,
                        verticalAlign: "middle" as const,
                        fontSize: 14,
                        color: charColor,
                        fontFamily: "-apple-system, BlinkMacSystemFont, Roboto, sans-serif",
                        lineHeight: "38px",
                      }}
                    >
                      {displayChar}
                    </td>
                  </tr>
                </table>
                <p
                  style={{
                    fontFamily: "-apple-system, BlinkMacSystemFont, Roboto, sans-serif",
                    fontSize: 12,
                    fontWeight: fontWeight,
                    color: labelColor,
                    margin: 0,
                    lineHeight: "1.3",
                  }}
                >
                  {showFailed ? "No entregado" : step.label}
                </p>
              </td>
            )
          })}
        </tr>
      </table>

      {/* Tracking link */}
      {trackingUrl && (
        <Row style={{ marginTop: 14 }}>
          <Column style={{ textAlign: "center" as const }}>
            <Text style={{ fontSize: 13, fontFamily: "-apple-system, BlinkMacSystemFont, Roboto, sans-serif", margin: 0, color: "#3A3A37" }}>
              Podés seguir tu pedido{" "}
              <Link href={trackingUrl} style={{ color: DARK, fontWeight: 700, textDecoration: "underline" }}>
                haciendo clic aquí
              </Link>
            </Text>
          </Column>
        </Row>
      )}
    </Section>
  )
}
