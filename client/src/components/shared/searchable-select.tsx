import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ChevronsUpDown, Check } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: Option[]
  pinnedValues?: string[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  pinnedValues = [],
  placeholder = 'Sélectionner...',
  searchPlaceholder = 'Rechercher...',
  emptyMessage = 'Aucun résultat.',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)

  const selectedLabel = options.find(o => o.value === value)?.label
  const pinned = pinnedValues.length > 0 ? options.filter(o => pinnedValues.includes(o.value)) : []
  const rest = pinnedValues.length > 0 ? options.filter(o => !pinnedValues.includes(o.value)) : options

  return (
    <>
      <Button
        variant="outline"
        type="button"
        className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        onClick={() => setOpen(true)}
      >
        {selectedLabel ?? placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 max-w-sm">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              {pinned.length > 0 && (
                <CommandGroup heading="Fréquent">
                  {pinned.map(o => (
                    <CommandItem
                      key={o.value}
                      value={o.label}
                      onSelect={() => { onValueChange(o.value); setOpen(false) }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === o.value ? 'opacity-100' : 'opacity-0')} />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {pinned.length > 0 && <CommandSeparator />}
              <CommandGroup heading={pinned.length > 0 ? 'Tous' : undefined}>
                {rest.map(o => (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => { onValueChange(o.value); setOpen(false) }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === o.value ? 'opacity-100' : 'opacity-0')} />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
