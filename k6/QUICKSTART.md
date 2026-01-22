# k6 Load Tests - Quick Start Guide

## 🚀 Quick Start (5 minutes)

### 1. Install k6

**macOS:**
```bash
brew install k6
```

**Linux/WSL:**
```bash
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### 2. Setup Environment (Optional)

Tests work out-of-the-box with seeded users! No configuration needed.

**Optional:** If you want to customize, copy the example:
```bash
cd k6
cp .env.example .env
```

The tests automatically use 6 seeded test users that are created when you seed your backend. All users share the password `brazil-tree-fire`.

### 3. Start Backend

```bash
cd ../backend
mise run start_backend
```

### 4. Run Tests

**Test 1 - Sustained Load (15 users, 90s):**
```bash
cd k6
k6 run tests/sustained-load.js
```

**Test 2 - Stress Spike (70 users with spike):**
```bash
k6 run tests/stress-spike.js
```

## ✅ Success Criteria

### Sustained Load Test
- 95% of requests complete in < 500ms
- Error rate < 1%
- All users authenticate successfully

### Stress Spike Test
- 95% of requests complete in < 1000ms
- Error rate < 5%
- System recovers after spike

## 📊 Reading Results

Look for these in the output:

```
✓ status is 200              // All requests successful
http_req_duration..............: avg=145ms p(95)=425ms    // Fast responses
http_req_failed................: 0.5%                     // Low error rate
```

**Good:** p(95) < 500ms, errors < 1%
**Warning:** p(95) 500-1000ms, errors 1-5%
**Problem:** p(95) > 1000ms, errors > 5%

## 🔧 Common Issues

### "Connection refused"
✅ Check backend is running: `curl http://localhost:5025/vantage/health`

### "401 Unauthorized"
✅ Verify test user exists and credentials in `.env` are correct

### High error rates
✅ Check backend logs for errors
✅ Verify database is running

## 📈 Next Steps

1. **Analyze Results** - Look for bottlenecks
2. **Optimize** - Fix slow endpoints
3. **Re-test** - Verify improvements
4. **Increase Load** - Try more users
5. **Automate** - Add to CI/CD

## 📚 Full Documentation

See [README.md](README.md) for complete documentation, advanced usage, and troubleshooting.

## 🎯 What These Tests Validate

### Test 1: Sustained Load
- ✓ System handles normal user load
- ✓ Performance is consistent over time
- ✓ No resource leaks

### Test 2: Stress Spike
- ✓ System handles sudden traffic spikes
- ✓ Graceful degradation under stress
- ✓ Recovery after spike

## 💡 Tips

- Start with fewer users and increase gradually
- Monitor backend logs during tests
- Run tests before deploying changes
- Keep test users separate from real users