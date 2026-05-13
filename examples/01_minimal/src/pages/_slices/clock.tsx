export default function ClockSlice() {
  return (
    <div data-testid="clock">
      The time on the server when this slice was rendered:{' '}
      {new Date().toISOString()}
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'static',
  } as const;
};
