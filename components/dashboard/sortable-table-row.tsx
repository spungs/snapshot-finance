'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TableRow, TableCell } from '@/components/ui/table'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SortableTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
    id: string
    disabled?: boolean
}

export function SortableTableRow({ id, disabled, children, className, ...props }: SortableTableRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <TableRow
            ref={setNodeRef}
            style={style}
            className={cn(className, isDragging && "opacity-50 bg-muted/50")}
            {...props}
        >
            <TableCell className="w-[50px]">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    disabled={disabled}
                    className={cn(
                        "touch-none cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded text-muted-foreground",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <GripVertical className="w-4 h-4" />
                </button>
            </TableCell>
            {children}
        </TableRow>
    )
}
