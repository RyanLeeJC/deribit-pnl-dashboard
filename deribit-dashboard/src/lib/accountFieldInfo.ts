export type AccountFieldInfoKey = 'equity' | 'balance' | 'availableMargin'

export type AccountFieldInfo = {
  key: AccountFieldInfoKey
  title: string
  description: string
}

export const ACCOUNT_FIELD_INFO: AccountFieldInfo[] = [
  {
    key: 'equity',
    title: 'Equity',
    description:
      'Equity is the current value of your account, pre-settlement and with unrealized PnL included.',
  },
  {
    key: 'balance',
    title: 'Balance',
    description:
      'Balance is the equity in your account post settlement. Any profits today need to be settled first, you can see the total value in the equity field.',
  },
  {
    key: 'availableMargin',
    title: 'Available (margin)',
    description:
      'Available (margin) is the remaining margin you can use in another trade or position.',
  },
]

