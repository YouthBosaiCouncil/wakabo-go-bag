import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'secondary' | 'destructive' | 'ghost' | 'link' | 'glass';
    size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', size = 'default', ...props }, ref) => {
        return (
            <button
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
                    {
                        'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:-translate-y-0.5': variant === 'default',
                        'bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-sm': variant === 'secondary',
                        'bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-md': variant === 'destructive',
                        'hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
                        'text-primary underline-offset-4 hover:underline': variant === 'link',
                        'bg-white/20 backdrop-blur-md border border-white/30 text-foreground hover:bg-white/30 hover:shadow-lg hover:-translate-y-0.5 dark:bg-slate-800/40 dark:hover:bg-slate-800/60': variant === 'glass',
                    },
                    {
                        'h-10 px-4 py-2': size === 'default',
                        'h-9 rounded-md px-3': size === 'sm',
                        'h-12 rounded-md px-8 text-base': size === 'lg',
                        'h-10 w-10': size === 'icon',
                    },
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export type IconButtonProps = ButtonProps;

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ className, size = 'icon', variant = 'ghost', ...props }, ref) => {
        return (
            <Button
                className={cn("rounded-full", className)}
                size={size}
                variant={variant}
                ref={ref}
                {...props}
            />
        )
    }
)
IconButton.displayName = "IconButton"

export { Button, IconButton };
