// Remove the import of Login if it's no longer used directly here
// import Login from '../components/Login';
import Link from 'next/link'; // Import Link for navigation

export default function HomePage() {
  // Later, we'll add logic here to check if the user is logged in
  const isLoggedIn = false; // Placeholder

  return (
    // Add padding, center content (for larger screens), and set a max width
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
        Research Paper Screening App
      </h1>

      {/* Center the conditional content */}
      <div className="text-center">
        {isLoggedIn ? (
          <p className="text-lg text-gray-700">
            Welcome back! Go to your{' '}
            <Link href="/dashboard" className="text-indigo-600 hover:text-indigo-800 font-medium underline">
              dashboard
            </Link>.
          </p> // Example link
        ) : (
          <p className="text-lg text-gray-700">
            Please{' '}
            <Link href="/login" className="text-indigo-600 hover:text-indigo-800 font-medium underline">
              log in
            </Link>{' '}
            to continue.
          </p>
        )}
      </div>
    </main>
  );
}