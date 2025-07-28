import React from 'react'

const LoginForm = () => {
  return (
    <div className="flex flex-col justify-center items-center min-h-screen">
      <div className='text-[#000000] text-4xl'>Universität für Bodenkultur Wien</div>

      <div className='text-[#000000] text-4xl' >Fish Database</div>
      <input
        type="text"
        id="username"
        name="username"
        placeholder="Username"
        required
        className="w-64 bg-[#fefefd] text-black border border-[#ccc] p-2 rounded mb-2"
      />

      <input
        type="password"
        id="password"
        name="password"
        placeholder="Password"
        required
        className="w-64 bg-[#fefefd] text-black border border-[#ccc] p-2 rounded mb-4"
      />
      <button type="submit" className="w-64 bg-[#357174] text-white p-2 rounded">Login</button>
    </div>

  )
}

export default LoginForm