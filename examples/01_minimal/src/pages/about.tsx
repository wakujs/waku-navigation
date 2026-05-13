import { Slice } from 'waku-navigation';

export default function AboutPage() {
  return (
    <>
      <h1>Welcome to the About Page</h1>
      <Slice id="clock" />
    </>
  );
}

export const getConfig = () => {
  return {
    render: 'static',
    slices: ['clock'],
  } as const;
};
