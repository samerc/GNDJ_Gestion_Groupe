import { useEffect } from 'react'
import { useSettingValue } from '@/services/settings-service'
import { setCurrencySymbols } from '@/lib/utils'

// Loads the customizable per-currency display symbols (cotisation.currency_symbols) into the runtime registry
// that formatMoney reads, so amounts show the CG-defined symbols app-wide. Renders nothing; mounted once in
// AppLayout. Falls back to the built-in defaults ($/€/ل.ل) until the setting arrives (avoids a symbol flash).
export function CurrencySymbolsSync() {
  const raw = useSettingValue('cotisation.currency_symbols')
  useEffect(() => {
    try {
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
      setCurrencySymbols(map)
    } catch { /* malformed json → keep current symbols */ }
  }, [raw])
  return null
}
