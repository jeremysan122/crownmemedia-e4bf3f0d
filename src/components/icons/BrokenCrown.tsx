import { forwardRef, type SVGProps } from "react";

interface BrokenCrownProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number | string;
  strokeWidth?: number | string;
}

/**
 * Themed "broken crown" icon used for the dislike reaction.
 * Drop-in compatible with lucide-react icon props (size, className,
 * strokeWidth, fill, color) so it can replace ThumbsDown one-for-one.
 *
 * Visual: a royal crown with a jagged crack splitting it down the middle
 * and the right half tilted/falling away — signalling "crown lost".
 */
export const BrokenCrown = forwardRef<SVGSVGElement, BrokenCrownProps>(
  ({ size = 24, strokeWidth = 2, className, fill = "none", color = "currentColor", ...props }, ref) => {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...props}
      >
        {/* Left half of crown */}
        <path d="M2 18h9" />
        <path d="M2 18 L3 8 L7 12 L11 5 L11.5 14" />
        {/* Jagged crack down the middle */}
        <path d="M11.5 5 L10.5 9 L12.5 11 L11 14 L12.5 18" />
        {/* Right half — tilted/falling */}
        <path d="M13 18 L21 19 L22 9 L18 13 L13.5 6 L13 15" />
        {/* Crown gems */}
        <circle cx="7" cy="12" r="0.6" fill={color} stroke="none" />
        <circle cx="18" cy="13" r="0.6" fill={color} stroke="none" />
      </svg>
    );
  }
);
BrokenCrown.displayName = "BrokenCrown";

export default BrokenCrown;
