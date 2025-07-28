import React from 'react'

const LoginForm = () => {
  return (
    <div className="flex flex-col justify-center items-center min-h-screen">
      <div className="bg-[#FCFBF9] rounded shadow-md flex flex-col items-center p-8">
        <div className='text-[#000000] text-4xl mb-2'>Universität für Bodenkultur Wien</div>
        <div className='text-[#000000] text-4xl mb-6'>Fish Database</div>
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
        <button type="submit" className="border-[#357174] w-64 hover:bg-[#4da1a6] text-white p-2 rounded hover:border-transparent bg-[#357174] transition-colors duration-300 hover:text-white mb-2">Login</button>
        <div className='text-[#000000] text-1xl'>Forgot password?</div>
      </div>
    </div>
  )
}

export default LoginForm