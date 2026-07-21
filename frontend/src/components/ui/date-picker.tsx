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

interface DatePickerProps {
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = "Chọn ngày",
  disabled = false,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            variant="outline"
            data-empty={!date}
            className={cn(
              "w-full justify-start text-left font-normal",
              "data-[empty=true]:text-muted-foreground"
            )}
          />
        }
      >
        <CalendarIcon className="h-4 w-4 shrink-0" />
        {date ? format(date, "dd/MM/yyyy") : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
