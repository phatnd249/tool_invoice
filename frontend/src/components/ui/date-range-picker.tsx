"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { DateRange } from "react-day-picker"

interface DateRangePickerProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  placeholder = "Chọn khoảng ngày",
  disabled = false,
}: DateRangePickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            variant="outline"
            data-empty={!dateRange?.from}
            className={cn(
              "w-full justify-start text-left font-normal",
              "data-[empty=true]:text-muted-foreground"
            )}
          />
        }
      >
        <CalendarIcon className="h-4 w-4 shrink-0" />
        {dateRange?.from ? (
          dateRange.to ? (
            <span>
              {format(dateRange.from, "dd/MM/yyyy")} -{" "}
              {format(dateRange.to, "dd/MM/yyyy")}
            </span>
          ) : (
            <span>{format(dateRange.from, "dd/MM/yyyy")}</span>
          )
        ) : (
          <span>{placeholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={onDateRangeChange}
          initialFocus
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}
