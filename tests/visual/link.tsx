import React from 'react';
// The local fixture uses real anchors; production still uses Next.js Link.
export default function Link({prefetch,scroll,replace,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>&{prefetch?:unknown;scroll?:unknown;replace?:unknown}){return <a {...props}/>}
