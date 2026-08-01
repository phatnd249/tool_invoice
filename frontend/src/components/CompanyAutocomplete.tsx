import { useState, useRef, useEffect, useCallback } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Company } from '@/types'

interface CompanyAutocompleteProps {
  companies: Company[]
  value: string // selected companyId
  onChange: (companyId: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function CompanyAutocomplete({
  companies,
  value,
  onChange,
  placeholder = 'Chọn công ty...',
  disabled = false,
}: CompanyAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Selected company object
  const selectedCompany = value
    ? companies.find((c) => c.id === value)
    : null

  // Filter companies based on query
  const filtered = companies.filter((c) => {
    if (!query) return true
    const q = query.toLowerCase().trim()
    return (
      c.name.toLowerCase().includes(q) ||
      c.taxCode.toLowerCase().includes(q)
    )
  })

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(-1)
  }, [query, companies])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () =>
      document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll(
        '[data-autocomplete-item]',
      )
      if (items[highlightIndex]) {
        items[highlightIndex].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightIndex])

  const selectCompany = useCallback(
    (companyId: string) => {
      onChange(companyId)
      setOpen(false)
      setQuery('')
    },
    [onChange],
  )

  const handleClear = useCallback(() => {
    onChange('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }, [onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          setOpen(true)
          e.preventDefault()
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightIndex((prev) =>
            Math.min(prev + 1, filtered.length - 1),
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (
            highlightIndex >= 0 &&
            highlightIndex < filtered.length
          ) {
            selectCompany(filtered[highlightIndex].id)
          }
          break
        case 'Escape':
          e.preventDefault()
          setOpen(false)
          break
      }
    },
    [open, filtered, highlightIndex, selectCompany],
  )

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger / Input */}
      <div className="relative">
        {selectedCompany ? (
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-2.5 py-1 text-sm shadow-xs">
            <span className="flex-1 truncate">
              {selectedCompany.name}
              <span className="ml-1 text-muted-foreground">
                ({selectedCompany.taxCode})
              </span>
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-1 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="pr-8"
          />
        )}
        {!selectedCompany && (
          <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 shadow-md ring-1 ring-foreground/10">
          {filtered.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              Không tìm thấy công ty nào.
            </div>
          ) : (
            <div ref={listRef}>
              {/* "Tất cả công ty" option */}
              <div
                data-autocomplete-item
                role="option"
                aria-selected={value === ''}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                  value === ''
                    ? 'bg-accent text-accent-foreground'
                    : '',
                  highlightIndex === -1
                    ? 'bg-accent/50'
                    : 'hover:bg-accent/50',
                )}
                onClick={() => {
                  onChange('')
                  setOpen(false)
                  setQuery('')
                }}
                onMouseEnter={() => setHighlightIndex(-1)}
              >
                <Check
                  className={cn(
                    'h-4 w-4',
                    value === '' ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="text-muted-foreground italic">
                  Tất cả công ty
                </span>
              </div>

              {filtered.map((c, idx) => (
                <div
                  key={c.id}
                  data-autocomplete-item
                  role="option"
                  aria-selected={value === c.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                    value === c.id
                      ? 'bg-accent text-accent-foreground'
                      : '',
                    highlightIndex === idx
                      ? 'bg-accent/50'
                      : 'hover:bg-accent/50',
                  )}
                  onClick={() => selectCompany(c.id)}
                  onMouseEnter={() => setHighlightIndex(idx)}
                >
                  <Check
                    className={cn(
                      'h-4 w-4',
                      value === c.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="truncate">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {c.taxCode}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
