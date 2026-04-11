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
  iconPath: string
  iconViewBox: string
}

const STEPS: StepDef[] = [
  {
    label: "Confirmado",
    iconPath: "M19 7h-1V6a5 5 0 00-10 0v1H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2zm-7 10a2 2 0 110-4 2 2 0 010 4zm3-10H9V6a3 3 0 016 0v1z",
    iconViewBox: "0 0 24 24",
  },
  {
    label: "En camino",
    iconPath: "M1 3h15v13H1zM16 8h4l3 3v6h-7V8zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm13 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
    iconViewBox: "0 0 24 24",
  },
  {
    label: "Entregado",
    iconPath: "M20 6L9 17l-5-5",
    iconViewBox: "0 0 24 24",
  },
]

// X icon for failed delivery
const FAILED_ICON_PATH = "M18 6L6 18M6 6l12 12"

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
  const showFailIcon = isFailed && index === 2

  let bg: string
  let borderColor: string
  let iconColor: string

  if (showFailIcon) {
    bg = RED
    borderColor = RED
    iconColor = "#ffffff"
  } else if (active) {
    bg = CORAL
    borderColor = CORAL
    iconColor = "#ffffff"
  } else if (completed) {
    bg = NAVY
    borderColor = NAVY
    iconColor = "#ffffff"
  } else {
    bg = "transparent"
    borderColor = GRAY_BG
    iconColor = GRAY_TEXT
  }

  const iconPath = showFailIcon ? FAILED_ICON_PATH : step.iconPath

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
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox={step.iconViewBox}
            fill="none"
            stroke={iconColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: "inline-block", verticalAlign: "middle" }}
          >
            <path d={iconPath} />
          </svg>
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
