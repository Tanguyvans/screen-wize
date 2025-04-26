import Login from '../../components/Login'; // Adjust the path based on your structure

export default function LoginPage() {
  return (
    // Use container, center, add padding similar to home page
    // Add min-height to ensure content is vertically centered if page is short
    // Use flexbox to center the content vertically and horizontally
    <div className="container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]"> {/* Adjust min-h based on header/footer height */}
      <div className="w-full max-w-md"> {/* Limit width of the content area */}
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">
          Login
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Please log in to access the screening features.
        </p>
        <Login />
        {/* Optional: Add links with styling */}
        <div className="mt-4 text-center text-sm">
           <a href="#" className="font-medium text-indigo-600 hover:text-indigo-500">
             Forgot your password?
           </a>
        </div>
       {/* You could add links like "Forgot Password?" or "Sign Up" here if needed */}
      </div>
    </div>
  );
}