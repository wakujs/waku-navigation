import type { ReactNode } from 'react';

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ul>
        <li>
          <a href="/">Home</a>
        </li>
        <li>
          <a href="/about">About</a>
        </li>
      </ul>
      <main>{children}</main>
    </>
  );
}
