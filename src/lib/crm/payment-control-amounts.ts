export interface PaymentControlAmountsInput {
  total: number;
  depositDue: number;
  depositPaid: number;
  balancePaid: number;
  openBalance: number;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function paymentControlAmounts(input: PaymentControlAmountsInput) {
  const depositShortfall = roundCurrency(Math.max(input.depositDue - input.depositPaid, 0));
  const configuredBalanceDue = roundCurrency(Math.max(input.total - input.depositDue, 0));
  const configuredBalanceShortfall = roundCurrency(Math.max(configuredBalanceDue - input.balancePaid, 0));
  const openBalance = roundCurrency(Math.max(input.openBalance, 0));
  const openBalanceAfterDeposit = roundCurrency(Math.max(openBalance - depositShortfall, 0));
  const balanceShortfall = roundCurrency(Math.min(configuredBalanceShortfall, openBalanceAfterDeposit));
  const balancePaidTarget = roundCurrency(input.balancePaid + balanceShortfall);

  return {
    depositShortfall,
    configuredBalanceDue,
    balanceShortfall,
    balancePaidTarget,
    openBalance
  };
}
