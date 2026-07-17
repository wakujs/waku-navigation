import { PrefetchButton } from '../components/prefetch-button.js';
import { ScrollButton } from '../components/scroll-button.js';
import { UserNav } from '../components/user-nav.js';

export default function HomePage() {
  return (
    <>
      <h1>Welcome to the Home Page</h1>
      <PrefetchButton to="/about" />
      <ScrollButton to="/about" scroll={false} testid="push-no-scroll" />
      <UserNav />
      <div style={{ height: '2000px' }} data-testid="tall-spacer" />
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
