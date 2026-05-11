import { SlowClientData } from '../components/slow-client-data.js';

const SERVER_DELAY_MS = 500;

export default async function SlowPage() {
  await new Promise((resolve) => setTimeout(resolve, SERVER_DELAY_MS));
  return (
    <>
      <h1>Slow Page</h1>
      <SlowClientData />
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
