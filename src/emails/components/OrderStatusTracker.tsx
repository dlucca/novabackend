// src/emails/components/OrderStatusTracker.tsx
import { Row, Column, Section, Text, Link } from "@react-email/components"
import * as React from "react"

const NAVY = "#003D70"
const CORAL = "#E8503A"
const GRAY_BG = "#E5E7EB"
const GRAY_TEXT = "#9CA3AF"
const LINE_ACTIVE = NAVY
const LINE_INACTIVE = GRAY_BG

type StepDef = {
  label: string
  // Inline SVG path data
  iconPath: string
  iconViewBox: string
}

const STEPS: StepDef[] = [
  {
    label: "Tu pedido",
    iconPath: "M19 7h-1V6a5 5 0 00-10 0v1H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2zm-7 10a2 2 0 110-4 2 2 0 010 4zm3-10H9V6a3 3 0 016 0v1z",
    iconViewBox: "0 0 24 24",
  },
  {
    label: "En preparación",
    iconPath: "M20 7l-8-4-8 4m16 0v10l-8 4m-8-4V7m16 0L12 11M4 7l8 4",
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

type Props = {
  currentStep: 0 | 1 | 2 | 3
  trackingUrl?: string
}

function StepCircle({ step, active, completed }: { step: StepDef; active: boolean; completed: boolean }) {
  const bg = active ? CORAL : completed ? NAVY : "transparent"
  const borderColor = active || completed ? (active ? CORAL : NAVY) : GRAY_BG
  const iconColor = active || completed ? "#ffffff" : GRAY_TEXT

  return (
    <table
      cellPadding={0}
      cellSpacing={0}
      style={{ margin: "0 auto" }}
    >
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
            <path d={step.iconPath} />
          </svg>
        </td>
      </tr>
    </table>
  )
}

export function OrderStatusTracker({ currentStep, trackingUrl }: Props) {
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
                <StepCircle step={step} active={active} completed={completed} />
              </Column>
              {!isLast && (
                <Column style={{ verticalAlign: "middle" as const, paddingBottom: 4 }}>
                  <div
                    style={{
                      height: 2,
                      backgroundColor: completed ? LINE_ACTIVE : LINE_INACTIVE,
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

          return (
            <React.Fragment key={i}>
              <Column style={{ width: 64, textAlign: "center" as const }}>
                <Text
                  style={{
                    fontSize: 10,
                    lineHeight: "1.3",
                    margin: 0,
                    color: active ? CORAL : completed ? NAVY : GRAY_TEXT,
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {step.label}
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
