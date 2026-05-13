import { PrefetchButton } from '../components/prefetch-button.js';

export default function HomePage() {
  return (
    <>
      <h1>Welcome to the Home Page</h1>
      <PrefetchButton to="/about" />
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
