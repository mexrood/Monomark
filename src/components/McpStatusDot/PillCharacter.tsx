interface PillCharacterProps {
  size?: number
  bodyColor?: string
}

export function PillCharacter({ size = 16, bodyColor = '#E07448' }: PillCharacterProps) {
  const scale = size / 22
  const width = Math.round(34 * scale)
  const height = size

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 34 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: 'pixelated' }}
    >
      <path
        d="M28 22H25V16H23V22H20V16H14V22H11V16H9V22H6V11H0V5H6V0H28V5H34V11H28V22Z"
        fill={bodyColor}
      />
      <rect x="9" y="3" width="3" height="3" fill="#040404" />
      <rect x="22" y="3" width="3" height="3" fill="#040404" />
    </svg>
  )
}
