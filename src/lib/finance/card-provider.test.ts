import { afterEach, describe, expect, it, vi } from "vitest";
import { CardProviderConfigError, cardProvider, squareWalletApplicationId } from "./card-provider";

afterEach(() => {
  delete process.env.CARD_PAYMENT_PROVIDER;
});

describe("card provider selection", () => {
  it("T12 unset refuses instead of defaulting to Square, and explicit values still resolve", () => {
    delete process.env.CARD_PAYMENT_PROVIDER;
    expect(() => cardProvider()).toThrow(CardProviderConfigError);
    expect(() => cardProvider()).toThrow(expect.objectContaining({
      status: 503,
      message: "Card payment provider is not configured.",
    }));
    process.env.CARD_PAYMENT_PROVIDER = "stripe";
    expect(cardProvider()).toBe("stripe");
    process.env.CARD_PAYMENT_PROVIDER = "square";
    expect(() => cardProvider()).toThrow("Square collection is retired");
  });

  it("treats blank and invalid values as a 503 refusal", () => {
    for (const value of ["", "   ", "paypal", "Square", "STRIPE"]) {
      process.env.CARD_PAYMENT_PROVIDER = value;
      expect(() => cardProvider(), value).toThrow(CardProviderConfigError);
      expect(() => cardProvider()).toThrow(expect.objectContaining({ status: 503 }));
    }
    process.env.CARD_PAYMENT_PROVIDER = "paypal";
    expect(() => cardProvider()).toThrow("Card collection requires Stripe. Square collection is retired.");
  });

  it("does not ask Square for a wallet application id unless Square is explicit", async () => {
    const resolve = vi.fn(async () => "sq0idp-test");
    delete process.env.CARD_PAYMENT_PROVIDER;
    await expect(squareWalletApplicationId(resolve)).resolves.toBeNull();
    process.env.CARD_PAYMENT_PROVIDER = "stripe";
    await expect(squareWalletApplicationId(resolve)).resolves.toBeNull();
    process.env.CARD_PAYMENT_PROVIDER = "square";
    await expect(squareWalletApplicationId(resolve)).resolves.toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
});
