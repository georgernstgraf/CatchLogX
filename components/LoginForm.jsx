import React from 'react'

const LoginForm = () => {
  return (
    <div className="flex flex-col justify-center items-center min-h-screen">
      <div className='text-[#000000]'>Universität für Bodenkultur Wien</div>
      <div className='text-[#000000]'>Fish Database</div>
      <input
        type="text"
        id="username"
        name="username"
        placeholder="Username"
        required
      />

      <input
        type="password"
        id="password"
        name="password"
        placeholder="Password"
        required
      />
      <button type="submit" style={{ backgroundColor: '#357174', color: '#fff' }}>Login</button>
    </div>

  )
}

export default LoginForm