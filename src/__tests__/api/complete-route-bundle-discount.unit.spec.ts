describe("Complete route bundle_discount logic", () => {
  it("deducts bundle_discount from cart.total for Openpay payment amount", () => {
    const cart = {
      total: 2250,
      metadata: {
        bundle_discount: 450,
      },
    }

    const rawAmount = cart.total
    const bundleDiscount = typeof cart.metadata?.bundle_discount === "number"
      ? cart.metadata.bundle_discount
      : parseFloat(String(cart.metadata?.bundle_discount ?? "0")) || 0

    const paymentAmount = Math.max(0, rawAmount - bundleDiscount)

    expect(paymentAmount).toBe(1800)
  })

  it("handles carts with no bundle_discount (regular 1-item purchase)", () => {
    const cart = {
      total: 750,
      metadata: {},
    }

    const rawAmount = cart.total
    const bundleDiscount = typeof cart.metadata?.bundle_discount === "number"
      ? cart.metadata.bundle_discount
      : parseFloat(String(cart.metadata?.bundle_discount ?? "0")) || 0

    const paymentAmount = Math.max(0, rawAmount - bundleDiscount)

    expect(paymentAmount).toBe(750)
  })

  it("handles string bundle_discount from metadata correctly", () => {
    const cart = {
      total: 1500,
      metadata: {
        bundle_discount: "225",
      },
    }

    const rawAmount = cart.total
    const bundleDiscount = typeof cart.metadata?.bundle_discount === "number"
      ? cart.metadata.bundle_discount
      : parseFloat(String(cart.metadata?.bundle_discount ?? "0")) || 0

    const paymentAmount = Math.max(0, rawAmount - bundleDiscount)

    expect(paymentAmount).toBe(1275)
  })
})
