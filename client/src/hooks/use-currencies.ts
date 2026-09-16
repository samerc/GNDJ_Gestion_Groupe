import { useMemo } from 'react'
import { useSettingValue } from '@/services/settings-service'
import { buildCurrencies, type CurrencyDef } from '@/lib/cotisation'

// The defined cotisation currencies (default/reference first with rate 1, then the others with their exchange
// rate), derived from the two cotisation settings via the single-key /settings/{key} endpoint (open to any
// authed user, so it works for a CU too). Every payment form uses this so the currency choices are the
// CG-defined list — fully customizable — instead of a hardcoded USD/EUR/LBP.
export function useCurrencies(): { currencies: CurrencyDef[]; defaultCurrency: string } {
  const def = useSettingValue('cotisation.default_currency')
  const rates = useSettingValue('cotisation.exchange_rates')
  return useMemo(() => {
    const currencies = buildCurrencies(def, rates)
    return { currencies, defaultCurrency: currencies[0]?.code ?? 'USD' }
  }, [def, rates])
}
