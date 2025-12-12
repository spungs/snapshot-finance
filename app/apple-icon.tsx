// app/apple-icon.tsx
import { ImageResponse } from 'next/og'
import { Camera } from 'lucide-react'

// Route segment config
export const runtime = 'edge'

// Image metadata
export const size = {
    width: 180,
    height: 180,
}
export const contentType = 'image/png'

// Image generation
export default function Icon() {
    return new ImageResponse(
        (
            // ImageResponse JSX element
            <div
                style={{
                    fontSize: 108,
                    background: 'linear-gradient(to bottom right, #22d3ee, #06b6d4)', // Gradient Cyan
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    borderRadius: '20%', // iOS icon style
                }}
            >
                <Camera size={100} color="white" strokeWidth={2} />
            </div>
        ),
        // ImageResponse options
        {
            ...size,
        }
    )
}
