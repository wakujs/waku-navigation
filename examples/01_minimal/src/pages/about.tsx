import { Slice } from 'waku-navigation';

export default function AboutPage() {
  return (
    <>
      <h1>Welcome to the About Page</h1>
      <Slice id="clock" />
      <div style={{ height: '2000px' }} />
    </>
  );
}

export const getConfig = () => {
  return {
    render: 'static',
    slices: ['clock'],
  } as const;
};
