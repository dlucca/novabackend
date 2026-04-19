// src/emails/components/OrderStatusTracker.tsx
import { Row, Column, Section, Text, Link } from "@react-email/components"
import * as React from "react"

const NAVY = "#003D70"
const CORAL = "#E8503A"
const RED = "#DC2626"
const GRAY_BG = "#E5E7EB"
const GRAY_TEXT = "#9CA3AF"

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

function StepCircle({
  step,
  index,
  active,
  completed,
  isFailed,
}: {
  step: StepDef
  index: number
  active: boolean
  completed: boolean
  isFailed: boolean
}) {
  let bg: string
  let borderColor: string
  let textColor: string

  const showFail = isFailed && index === 2

  if (showFail) {
    bg = RED
    borderColor = RED
    textColor = "#ffffff"
  } else if (active) {
    bg = CORAL
    borderColor = CORAL
    textColor = "#ffffff"
  } else if (completed) {
    bg = NAVY
    borderColor = NAVY
    textColor = "#ffffff"
  } else {
    bg = "transparent"
    borderColor = GRAY_BG
    textColor = GRAY_TEXT
  }

  const char = showFail ? FAILED_CHAR : step.char

  return (
    <table cellPadding={0} cellSpacing={0} style={{ margin: "0 auto" }}>
      <tr>
        <td
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: bg,
            border: `2px solid ${borderColor}`,
            textAlign: "center" as const,
            verticalAlign: "middle" as const,
            fontSize: 18,
            color: textColor,
            fontFamily: "Arial, sans-serif",
            lineHeight: "48px",
          }}
        >
          {char}
        </td>
      </tr>
    </table>
  )
}

export function OrderStatusTracker({
  currentStep,
  variant = "default",
  trackingUrl,
}: Props) {
  const isFailed = variant === "failed"

  return (
    <Section style={{ margin: "28px 0 20px" }}>
      {/* Circles + lines */}
      <Row>
        {STEPS.map((step, i) => {
          const active = i === currentStep
          const completed = i < currentStep
          const isLast = i === STEPS.length - 1

          return (
            <React.Fragment key={i}>
              <Column style={{ width: 64, textAlign: "center" as const }}>
                <StepCircle
                  step={step}
                  index={i}
                  active={active}
                  completed={completed}
                  isFailed={isFailed}
                />
              </Column>
              {!isLast && (
                <Column style={{ verticalAlign: "middle" as const, paddingBottom: 4 }}>
                  <div
                    style={{
                      height: 2,
                      backgroundColor: completed ? NAVY : GRAY_BG,
                    }}
                  />
                </Column>
              )}
            </React.Fragment>
          )
        })}
      </Row>

      {/* Labels */}
      <Row style={{ marginTop: 10 }}>
        {STEPS.map((step, i) => {
          const active = i === currentStep
          const completed = i < currentStep
          const isLast = i === STEPS.length - 1
          const showFailed = isFailed && i === 2

          let labelColor: string
          if (showFailed) {
            labelColor = RED
          } else if (active) {
            labelColor = CORAL
          } else if (completed) {
            labelColor = NAVY
          } else {
            labelColor = GRAY_TEXT
          }

          return (
            <React.Fragment key={i}>
              <Column style={{ width: 64, textAlign: "center" as const }}>
                <Text
                  style={{
                    fontSize: 10,
                    lineHeight: "1.3",
                    margin: 0,
                    color: labelColor,
                    fontWeight: active || showFailed ? 700 : 400,
                  }}
                >
                  {showFailed ? "No entregado" : step.label}
                </Text>
              </Column>
              {!isLast && <Column />}
            </React.Fragment>
          )
        })}
      </Row>

      {/* Tracking link */}
      {trackingUrl && (
        <Row style={{ marginTop: 16 }}>
          <Column style={{ textAlign: "center" as const }}>
            <Text style={{ fontSize: 13, margin: 0, color: "#4B5563" }}>
              Podés seguir tu pedido{" "}
              <Link href={trackingUrl} style={{ color: CORAL, fontWeight: 700 }}>
                haciendo clic aquí
              </Link>
            </Text>
          </Column>
        </Row>
      )}
    </Section>
  )
}
