import React from 'react';

const App = () => {
  return (
    <>
      {/* Use StrictMode only in development */}
      {process.env.NODE_ENV === 'development' ? <React.StrictMode><MainComponent /></React.StrictMode> : <MainComponent />}
    </>
  );
};

export default App;