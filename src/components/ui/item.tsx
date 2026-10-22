import React from 'react';
import { XCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ItemData } from '../../types';
import { iconMap } from '../../lib/icons';
import { normalizeItem, getItemName } from '../../lib/utils';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ItemProps {
    item: string | ItemData;
    isSelected: boolean;
    onClick: () => void;
    isEditable?: boolean;
    onDelete?: () => void;
    disabled?: boolean;
}

export const Item: React.FC<ItemProps> = ({ item, isSelected, onClick, isEditable = false, onDelete, disabled = false }) => {
    const itemData = normalizeItem(item);
    const itemName = getItemName(item);
    const IconComponent = iconMap[itemData.icon as keyof typeof iconMap] ?? iconMap.package;

    const Tag = isEditable ? 'div' : 'button';
    return (
        <Tag
            {...(!isEditable ? { type: 'button' as const, 'aria-pressed': isSelected, disabled, onClick } : {})}
            className={cn(
                'relative p-3 rounded-xl transition-all duration-200 text-sm text-center border flex flex-col items-center gap-2 group focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60',
                isEditable ? '' : 'cursor-pointer',
                isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-md font-bold scale-105'
                    : 'bg-card text-card-foreground border-border hover:border-primary/50 hover:shadow-sm',
                !isEditable && !isSelected && 'hover:scale-105'
            )}
            title={itemData.description || itemName}
        >
            {itemData.icon && (
                <IconComponent
                    size={24}
                    className={cn(
                        'flex-shrink-0 transition-colors',
                        isSelected ? 'text-primary-foreground' : 'text-primary'
                    )}
                />
            )}
            <span className="leading-tight">{itemName}</span>
            {itemData.category && (
                <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full',
                    isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-secondary text-secondary-foreground'
                )}>
                    {itemData.category}
                </span>
            )}
            {isEditable && onDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-destructive/90"
                    title={`${itemName}を削除`}
                    aria-label={`${itemName}を削除`}
                >
                    <XCircle size={18} />
                </button>
            )}
        </Tag>
    );
};
