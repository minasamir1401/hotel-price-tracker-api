"""Run with the HTTP runtime: python backend/tests/http-worker.test.py."""
import importlib.util
import unittest
from pathlib import Path
from curl_cffi.requests import Session

spec = importlib.util.spec_from_file_location("worker", Path(__file__).parents[1] / "scrapers" / "almosafer-http-worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class GuestSessionTests(unittest.TestCase):
    def test_supported_profile_tracks_the_exported_browser_version(self):
        self.assertEqual(worker.browser_profile("Mozilla/5.0 Chrome/145.0.0.0"), "chrome145")
        self.assertEqual(worker.browser_profile("Mozilla/5.0 Chrome/131.0.0.0"), "chrome131")

    def test_renewed_guest_cookies_replace_old_and_removed_cookies(self):
        with Session() as session:
            worker.restore_cookies(session, "guest=old; removed=old")
            worker.restore_cookies(session, "guest=new; fresh=yes")
            self.assertEqual(dict(session.cookies), {"guest": "new", "fresh": "yes"})
            worker.restore_cookies(session, "")
            self.assertEqual(dict(session.cookies), {})


if __name__ == "__main__":
    unittest.main()
